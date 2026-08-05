using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Telegram;

// Queue + drain for chat messages the bot owes. See Data/OutboxMessage.cs for what
// belongs here and what deliberately does not.
// The client behind IChatSender is an adapter concern – see IChatSender.cs. Nothing in
// this file may name a Bot API library, or swapping one breaks the delivery loop's tests.
public sealed class Outbox(AppDbContext db, IChatSender sender, SettingsService settings, ILogger<Outbox> log)
{
    // Backoff per attempt, then give up. Roughly 30s → 2m → 10m → 1h → 6h: fast enough
    // to ride out a blip, slow enough that a genuinely dead chat isn't hammered for days.
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromSeconds(30),
        TimeSpan.FromMinutes(2),
        TimeSpan.FromMinutes(10),
        TimeSpan.FromHours(1),
        TimeSpan.FromHours(6),
    ];

    public async Task<OutboxMessage> EnqueueAsync(
        string kind, long chatId, string text, object? replyMarkup = null,
        string? relatedKind = null, string? relatedKey = null,
        TimeSpan? expiresIn = null, string? chatSetting = null, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var row = new OutboxMessage
        {
            Kind = kind,
            ChatId = chatId,
            ChatSetting = chatSetting,
            Text = text,
            ReplyMarkupJson = replyMarkup is null ? null : JsonSerializer.Serialize(replyMarkup),
            RelatedKind = relatedKind,
            RelatedKey = relatedKey,
            Status = "pending",
            CreatedAt = now,
            NextAttemptAt = now,          // first try immediately, on the next dispatcher tick
            ExpiresAt = expiresIn is { } ttl ? now + ttl : null,
        };
        db.Outbox.Add(row);
        await db.SaveChangesAsync(ct);
        return row;
    }

    // Puts every message that gave up back in the queue. Returns how many were revived.
    //
    // Called once per process start. A restart is the one moment where retrying something
    // that already exhausted its ladder is worth it rather than futile: the usual reason
    // this process is starting is that a deploy just changed the code, and the last outage
    // was our own payload. Outbox 6 – an anon moderation card – died five attempts deep on
    // `field "url" must be of type String`, a bug in the sender that no amount of further
    // retrying could have fixed and that shipping the fix does. Without this, the fix goes
    // live and the card still never arrives.
    //
    // Attempts resets so a revived message gets the full backoff ladder again; a genuinely
    // dead chat therefore costs five more attempts per restart, which is bounded by how
    // often we deploy. Expired messages stay expired – their TTL said the content stops
    // being worth delivering, and that is still true.
    public async Task<int> RequeueFailedAsync(CancellationToken ct)
    {
        var failed = await db.Outbox.Where(m => m.Status == "failed").ToListAsync(ct);
        if (failed.Count == 0) return 0;

        var now = DateTimeOffset.UtcNow;
        foreach (var msg in failed)
        {
            msg.Status = "pending";
            msg.Attempts = 0;
            msg.NextAttemptAt = now;      // due on the first tick after boot
            // LastError is left alone: until the retry lands it is still the best
            // explanation of why this message is old, and the next attempt overwrites it.
        }

        await db.SaveChangesAsync(ct);
        log.LogInformation("Outbox requeued {Count} message(s) that had given up: {Ids}.",
            failed.Count, string.Join(", ", failed.Select(m => $"{m.Id} ({m.Kind})")));
        return failed.Count;
    }

    // Sends everything that is due. Returns how many went out.
    public async Task<int> DispatchDueAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var due = await db.Outbox
            .Where(m => m.Status == "pending" && m.NextAttemptAt <= now)
            .OrderBy(m => m.NextAttemptAt)
            .Take(20)                     // bounded: a backlog drains over several ticks
            .ToListAsync(ct);

        var sent = 0;
        foreach (var msg in due)
        {
            if (msg.ExpiresAt is { } expiry && expiry < now)
            {
                // A moderation card from last week is still useful; a "poll closes in an
                // hour" notice is not. Only messages that opted into a TTL expire.
                msg.Status = "expired";
                log.LogWarning("Outbox {Id} ({Kind}) expired before it could be delivered.", msg.Id, msg.Kind);
                continue;
            }

            // Late resolution: a message aimed at "the admin chat" goes wherever that
            // setting points right now, not where it pointed when it was queued.
            var chatId = msg.ChatSetting is null
                ? msg.ChatId
                : await settings.GetLongAsync(msg.ChatSetting, ct);

            if (chatId == 0)
            {
                log.LogWarning("Outbox {Id} ({Kind}) has no destination yet ({Setting} is unset); leaving it queued.",
                    msg.Id, msg.Kind, msg.ChatSetting);
                continue;
            }

            // The stored keyboard JSON is handed over as-is; the adapter maps it into
            // whatever its client wants. Previews stay suppressed – a moderation card is
            // mostly links, and with previews on it renders as a wall of cards.
            var result = await sender.SendMessageAsync(
                new ChatMessage(chatId, msg.Text, msg.ReplyMarkupJson, DisablePreview: true), ct);

            msg.Attempts++;

            if (result.Ok)
            {
                msg.Status = "sent";
                msg.SentAt = DateTimeOffset.UtcNow;
                msg.LastError = null;
                await ApplyDeliveryAsync(msg, result.MessageId, ct);
                sent++;
                continue;
            }

            msg.LastError = result.Error;
            if (msg.Attempts >= Backoff.Length)
            {
                msg.Status = "failed";
                log.LogError("Outbox {Id} ({Kind}) gave up after {Attempts} attempts: {Error}",
                    msg.Id, msg.Kind, msg.Attempts, result.Error);
            }
            else
            {
                msg.NextAttemptAt = DateTimeOffset.UtcNow + Backoff[msg.Attempts - 1];
                log.LogWarning("Outbox {Id} ({Kind}) attempt {Attempts} failed ({Error}); retrying at {Next:HH:mm}.",
                    msg.Id, msg.Kind, msg.Attempts, result.Error, msg.NextAttemptAt);
            }
        }

        if (due.Count > 0) await db.SaveChangesAsync(ct);
        return sent;
    }

    // Write the delivered message id back to whatever this message was about, so later
    // edits (the moderation card) know where to land.
    private async Task ApplyDeliveryAsync(OutboxMessage msg, long messageId, CancellationToken ct)
    {
        if (msg.RelatedKind != "anon" || msg.RelatedKey is null) return;

        var anon = await db.AnonRequests.FirstOrDefaultAsync(r => r.PublicId == msg.RelatedKey, ct);
        if (anon is null) return;
        anon.AdminMessageId = messageId;
    }
}
