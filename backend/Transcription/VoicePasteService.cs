using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Transcription;

// What the webhook knows about "/paste in reply to a voice message", in our vocabulary.
// AuthorId/AuthorName are whoever recorded the voice; RequesterId is whoever typed
// /paste – in a DM that is the person the membership check is about.
public sealed record VoiceRequest(
    long ChatId,
    string ChatType,
    long CommandMessageId,
    long VoiceMessageId,
    string FileId,
    string FileUniqueId,
    int DurationSeconds,
    long? FileSize,
    long? RequesterId,
    long? AuthorId,
    string AuthorName);

// The webhook half of voice transcription: every check that can be answered in the few
// seconds Telegram gives the webhook, then a job row for the worker and a "расшифровываю"
// reply. Nothing here calls OpenRouter.
//
// The checks, in order, each one answered in the chat rather than silently – a /paste
// that does nothing reads as a broken bot:
//   1. the feature is on and has a key;
//   2. the chat is allowed: a group on voice.chats, or a DM from a member of one;
//   3. this voice was not already transcribed (or is not being transcribed right now);
//   4. it fits: voice.max_minutes, and Telegram's 20 MB download cap.
// The dedupe check comes before the limits on purpose: a voice that was transcribed
// before a limit was lowered still has its link, and handing it out costs nothing.
public sealed class VoicePasteService(
    AppDbContext db,
    SettingsService settings,
    IChatSender chat,
    TelegramClient tg,
    IMemoryCache cache,
    VoiceQueueSignal signal,
    IOptions<OpenRouterOptions> openRouter,
    IConfiguration cfg,
    ILogger<VoicePasteService> log)
{
    // getFile refuses anything bigger for a bot – checked here so the answer comes now,
    // not from a worker that already promised a link.
    public const long MaxDownloadBytes = 20L * 1024 * 1024;

    private static readonly TimeSpan MembershipTtl = TimeSpan.FromMinutes(10);

    public async Task HandleAsync(VoiceRequest r, CancellationToken ct)
    {
        if (!openRouter.Value.Enabled || !await settings.GetBoolAsync("voice.enabled", ct))
        {
            log.LogInformation("/paste on a voice in a {ChatType} chat: transcription is off (key {KeyState}).",
                r.ChatType, openRouter.Value.Enabled ? "set" : "missing");
            await ReplyAsync(r, "Расшифровка голосовых сейчас выключена.", ct);
            return;
        }

        var chats = await settings.GetLongListAsync("voice.chats", ct);
        var isPrivate = string.Equals(r.ChatType, "private", StringComparison.Ordinal);
        if (!isPrivate && !chats.Contains(r.ChatId))
        {
            log.LogInformation("/paste on a voice refused: this {ChatType} chat is not on voice.chats.", r.ChatType);
            await ReplyAsync(r, "В этом чате расшифровка голосовых не включена.", ct);
            return;
        }
        if (isPrivate && !await IsMemberOfAnyAsync(chats, r.RequesterId, ct))
        {
            log.LogInformation("/paste on a voice refused in a DM: the sender is not in any voice chat.");
            await ReplyAsync(r, "Голосовые в личке расшифровываю только участникам чата сообщества.", ct);
            return;
        }

        var existing = await db.VoiceTranscriptions.FirstOrDefaultAsync(v => v.FileUniqueId == r.FileUniqueId, ct);
        if (existing is { Status: "pending" or "running" })
        {
            log.LogInformation("/paste on a voice: transcription {Id} already {Status}.", existing.Id, existing.Status);
            await ReplyAsync(r, "Это голосовое уже расшифровываю – ссылка появится там, где его попросили первым.", ct);
            return;
        }
        if (existing is { Status: "done", PastePublicId: { } done } && await PasteIsLiveAsync(done, ct))
        {
            log.LogInformation("/paste on a voice: already transcribed as paste {PublicId}.", done);
            await chat.SendMessageAsync(new ChatMessage(r.ChatId,
                $"📋 Это голосовое уже расшифровано: {TelegramWebhookEndpoints.PasteLink(done, cfg)}",
                DisablePreview: false, ReplyToMessageId: r.VoiceMessageId), ct);
            return;
        }

        var maxMinutes = await settings.GetIntAsync("voice.max_minutes", ct);
        if (r.DurationSeconds > maxMinutes * 60)
        {
            log.LogInformation("/paste on a voice refused: {Duration}s, over the {Max}-minute limit.", r.DurationSeconds, maxMinutes);
            await ReplyAsync(r,
                $"Голосовое длится {Clock(r.DurationSeconds)} – это больше {maxMinutes} мин. Такие не расшифровываю.", ct);
            return;
        }
        if (r.FileSize > MaxDownloadBytes)
        {
            log.LogInformation("/paste on a voice refused: {Size} bytes, over Telegram's 20 MB download cap.", r.FileSize);
            await ReplyAsync(r, "Файл больше 20 МБ – Telegram не дает ботам скачивать такие.", ct);
            return;
        }

        // A failed job, or a done one whose paste has since expired, is picked up again
        // rather than duplicated: FileUniqueId is unique, and the new request's chat is
        // where the new answer belongs.
        var job = existing ?? db.VoiceTranscriptions.Add(new VoiceTranscription { FileUniqueId = r.FileUniqueId }).Entity;
        job.FileId = r.FileId;
        job.DurationSeconds = r.DurationSeconds;
        job.ChatId = r.ChatId;
        job.VoiceMessageId = r.VoiceMessageId;
        job.StatusMessageId = 0;
        job.AuthorName = r.AuthorName;
        job.AuthorTgId = r.AuthorId;
        job.Status = "pending";
        job.Attempts = 0;
        job.PastePublicId = null;
        job.LastError = null;
        job.CostUsd = null;
        job.CreatedAt = job.NextAttemptAt = DateTimeOffset.UtcNow;
        job.CompletedAt = null;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost the race on the unique index: another /paste on the same voice landed
            // between our lookup and our insert. That one is doing the work.
            log.LogInformation("/paste on a voice: lost the insert race, another request is transcribing it.");
            await ReplyAsync(r, "Это голосовое уже расшифровываю – ссылка появится там, где его попросили первым.", ct);
            return;
        }

        // Threaded under the voice itself, so the link the worker edits in later sits
        // right where the chat is looking. If this reply fails, the job still runs and
        // the worker sends the link as a fresh message instead.
        var status = await chat.SendMessageAsync(new ChatMessage(r.ChatId,
            $"🎙 Расшифровываю голосовое ({Clock(r.DurationSeconds)}). Обычно это занимает до минуты – ссылка появится здесь.",
            ReplyToMessageId: r.VoiceMessageId), ct);
        if (status.Ok)
        {
            job.StatusMessageId = status.MessageId;
            await db.SaveChangesAsync(ct);
        }

        log.LogInformation("Voice transcription {Id} queued from a {ChatType} chat: {Duration}s, {Size} bytes.",
            job.Id, r.ChatType, r.DurationSeconds, r.FileSize);
        signal.Wake();
    }

    // Any one of the voice chats is enough. Cached per user, both ways: a member is not
    // re-checked on every voice, and someone who is not in the chat cannot make the bot
    // hammer getChatMember by retrying.
    private async Task<bool> IsMemberOfAnyAsync(IReadOnlyList<long> chats, long? userId, CancellationToken ct)
    {
        if (userId is not { } id) return false;

        foreach (var chatId in chats)
        {
            if (chatId == 0) continue;
            var member = await cache.GetOrCreateAsync(("voice-member", chatId, id), async e =>
            {
                e.AbsoluteExpirationRelativeToNow = MembershipTtl;
                return await tg.IsChatMemberAsync(chatId, id, ct) ?? false;
            });
            if (member) return true;
        }
        return false;
    }

    private async Task<bool> PasteIsLiveAsync(string publicId, CancellationToken ct) =>
        await db.Pastes.AnyAsync(p => p.PublicId == publicId
            && (p.ExpiresAt == null || p.ExpiresAt > DateTimeOffset.UtcNow), ct);

    private Task<SendOutcome> ReplyAsync(VoiceRequest r, string text, CancellationToken ct) =>
        chat.SendMessageAsync(new ChatMessage(r.ChatId, text, ReplyToMessageId: r.CommandMessageId), ct);

    // 7:41, the way Telegram shows a voice's length.
    public static string Clock(int seconds) => $"{seconds / 60}:{seconds % 60:00}";
}

// Wakes the worker the moment a job is queued instead of on its next tick. A capacity-one
// channel: ten wakes before the worker looks collapse into one, and the worker drains
// everything due when it does look, so nothing is lost by collapsing them.
public sealed class VoiceQueueSignal
{
    private readonly System.Threading.Channels.Channel<bool> _channel =
        System.Threading.Channels.Channel.CreateBounded<bool>(
            new System.Threading.Channels.BoundedChannelOptions(1)
            {
                FullMode = System.Threading.Channels.BoundedChannelFullMode.DropWrite,
            });

    public void Wake() => _channel.Writer.TryWrite(true);

    // Returns when woken or when `timeout` passes, whichever is first.
    public async Task WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        linked.CancelAfter(timeout);
        try
        {
            await _channel.Reader.ReadAsync(linked.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
    }
}
