using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Telegram;

// The anonymous-request pipeline: create -> moderation card in the admin chat ->
// publish to the community chat (or reject). Shared by the HTTP endpoint (site
// form, shell) and the bot webhook (DM), so both sources behave identically.
public sealed class AnonService(
    AppDbContext db,
    TelegramClient tg,
    Outbox outbox,
    SettingsService settings,
    IOptions<TelegramOptions> options,
    ILogger<AnonService> log)
{
    private readonly TelegramOptions _opt = options.Value;

    // Kazakhstan is UTC+5 year-round, so a fixed offset beats a tz-database lookup
    // (the container runs with InvariantGlobalization and no tzdata).
    private static readonly TimeSpan AlmatyOffset = TimeSpan.FromHours(5);

    // Ambiguous glyphs (0/O, 1/I) left out – people read these ids back to the bot.
    private const string IdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    // Beyond this many still-pending requests from the same author, we stop creating
    // cards. Tunable at runtime (anon.max_pending_per_author): the right number depends
    // on how much moderation the admins can absorb, which only shows up in practice.
    // The submitter still gets a success response either way – telling a flooder they
    // were throttled just invites them to rotate identity.

    public enum CreateOutcome { Created, Throttled }

    public async Task<(CreateOutcome Outcome, AnonRequest Request)> CreateAsync(
        string text, string source, string? authorHash, CancellationToken ct)
    {
        if (authorHash is not null)
        {
            var pending = await db.AnonRequests.CountAsync(
                r => r.AuthorHash == authorHash && r.Status == "pending", ct);
            if (pending >= await settings.GetIntAsync("anon.max_pending_per_author", ct))
            {
                log.LogWarning("Anon request throttled: {Pending} already pending for this author.", pending);
                return (CreateOutcome.Throttled, new AnonRequest { PublicId = RandomId(6), Text = text });
            }
        }

        var row = new AnonRequest
        {
            PublicId = await NewPublicIdAsync(ct),
            Text = text.Trim(),
            Source = source,
            Status = "pending",
            AuthorHash = authorHash,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.AnonRequests.Add(row);
        await db.SaveChangesAsync(ct);

        await SendCardAsync(row, ct);
        return (CreateOutcome.Created, row);
    }

    // Queues the moderation card rather than sending it. The submitter's HTTP request
    // does not wait on Telegram, and – more importantly – a card is never lost to an
    // outage, a rate limit, or a bot that is not configured yet: the outbox keeps
    // retrying and flushes the backlog once the token appears.
    private async Task SendCardAsync(AnonRequest row, CancellationToken ct)
    {
        // Destination resolved at send time via the setting, so a card queued while
        // tg.admin_chat_id is wrong (or unset) still lands once it is corrected.
        // No TTL: a moderation card is worth delivering however late it arrives.
        await outbox.EnqueueAsync("anon_card", 0, CardText(row), PendingKeyboard(row.PublicId),
            relatedKind: "anon", relatedKey: row.PublicId, chatSetting: "tg.admin_chat_id", ct: ct);
    }

    public async Task<AnonRequest?> FindAsync(string publicId, CancellationToken ct) =>
        await db.AnonRequests.FirstOrDefaultAsync(r => r.PublicId == publicId, ct);

    // Publishes to the community chat and settles the card. Idempotent: a second
    // tap on an already-decided request is a no-op.
    public async Task<string> PublishAsync(AnonRequest row, long byTgId, CancellationToken ct)
    {
        if (row.Status != "pending") return $"Уже {StatusRu(row.Status)}.";

        var communityChat = await settings.GetLongAsync("tg.community_chat_id", ct);
        if (communityChat == 0) return "Не задан tg.community_chat_id.";

        var sent = await tg.SendMessageAsync(communityChat, PublishedText(row), ct: ct);
        if (!sent.Ok)
        {
            // Leave it pending with live buttons so the admin can retry after the fix.
            await UpdateCardAsync(row, $"{CardText(row)}\n\n⚠️ Ошибка публикации: {sent.Error}", PendingKeyboard(row.PublicId), ct);
            return $"Не отправилось: {sent.Error}";
        }

        row.Status = "published";
        row.PublishedMessageId = sent.MessageId;
        row.ModeratedAt = DateTimeOffset.UtcNow;
        row.ModeratedByTgId = byTgId;
        await db.SaveChangesAsync(ct);

        var link = MessageLink(communityChat, sent.MessageId);
        await UpdateCardAsync(row, $"✅ Опубликовано · {row.PublicId}\n{link}\n\n{row.PublishText}", null, ct);
        return "Опубликовано.";
    }

    public async Task<string> RejectAsync(AnonRequest row, long byTgId, CancellationToken ct)
    {
        if (row.Status != "pending") return $"Уже {StatusRu(row.Status)}.";

        row.Status = "rejected";
        row.ModeratedAt = DateTimeOffset.UtcNow;
        row.ModeratedByTgId = byTgId;
        await db.SaveChangesAsync(ct);

        await UpdateCardAsync(row, $"🚫 Отклонено · {row.PublicId}\n\n{row.PublishText}", null, ct);
        return "Отклонено.";
    }

    // An admin rewrote the text (usually to strip identifying details). The card
    // re-renders with the new version and the buttons stay live.
    public async Task<string> ApplyEditAsync(AnonRequest row, string newText, CancellationToken ct)
    {
        if (row.Status != "pending") return $"Уже {StatusRu(row.Status)}, правка не применена.";

        row.EditedText = newText.Trim();
        await db.SaveChangesAsync(ct);
        await UpdateCardAsync(row, CardText(row), PendingKeyboard(row.PublicId), ct);
        return "Правка сохранена. Проверьте карточку и жмите «Опубликовать».";
    }

    private async Task UpdateCardAsync(AnonRequest row, string text, object? keyboard, CancellationToken ct)
    {
        if (row.AdminMessageId is not { } messageId) return;
        var adminChat = await settings.GetLongAsync("tg.admin_chat_id", ct);
        if (adminChat == 0) return;
        await tg.EditMessageTextAsync(adminChat, messageId, text, keyboard, ct);
    }

    // ── rendering ───────────────────────────────────────────────────────────

    private static string CardText(AnonRequest row)
    {
        var when = row.CreatedAt.ToOffset(AlmatyOffset).ToString("dd.MM HH:mm");
        var edited = string.IsNullOrWhiteSpace(row.EditedText) ? "" : "\n(текст отредактирован админом)";
        return $"""
            🕵️ Анонимный запрос {row.PublicId}
            источник: {SourceRu(row.Source)} · {when}{edited}

            {row.PublishText}
            """;
    }

    private static string PublishedText(AnonRequest row) => $"""
        🕵️ Анонимный вопрос

        {row.PublishText}

        Прислано анонимно · @temlead_helper_bot · teamleads.kz/anon
        """;

    private static object PendingKeyboard(string publicId) => new
    {
        inline_keyboard = new[]
        {
            new[]
            {
                new { text = "✅ Опубликовать", callback_data = $"anon:pub:{publicId}" },
                new { text = "✏️ Правка",       callback_data = $"anon:edit:{publicId}" },
                new { text = "🚫 Отклонить",    callback_data = $"anon:rej:{publicId}" },
            },
        },
    };

    // Deep link to a message in a supergroup: the -100 prefix is dropped in t.me/c/ links.
    private static string MessageLink(long chatId, long messageId)
    {
        var raw = chatId.ToString();
        return raw.StartsWith("-100", StringComparison.Ordinal)
            ? $"https://t.me/c/{raw[4..]}/{messageId}"
            : "";
    }

    public static string SourceRu(string source) => source switch
    {
        "form" => "сайт",
        "shell" => "терминал",
        "bot" => "бот",
        "context" => "цитата из текста",
        _ => source,
    };

    public static string StatusRu(string status) => status switch
    {
        "pending" => "на модерации",
        "published" => "опубликовано",
        "rejected" => "отклонено",
        _ => status,
    };

    // ── ids ─────────────────────────────────────────────────────────────────

    private async Task<string> NewPublicIdAsync(CancellationToken ct)
    {
        // Six chars out of 32 is ~1e9 combinations: collisions are a curiosity, not
        // a plan, but the id is unique in the schema so we check before inserting.
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var id = RandomId(6);
            if (!await db.AnonRequests.AnyAsync(r => r.PublicId == id, ct)) return id;
        }
        return RandomId(10);
    }

    private static string RandomId(int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = IdAlphabet[RandomNumberGenerator.GetInt32(IdAlphabet.Length)];
        return new string(chars);
    }
}
