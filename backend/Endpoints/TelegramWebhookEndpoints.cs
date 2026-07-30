using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Security;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Endpoints;

// Telegram delivers updates here. Two jobs: accept anonymous questions sent to the
// bot in DM, and act on the moderation buttons in the admin chat.
//
// Deliberately NOT rate-limited: Telegram retries hard on any non-2xx, and a 429
// would make it back off on legitimate traffic. Access control is the unguessable
// path segment plus the secret-token header, both compared in constant time.
//
// Every path returns 200. A non-200 makes Telegram redeliver the same update
// forever, so failures are logged and swallowed rather than surfaced.
public static class TelegramWebhookEndpoints
{
    private const int MinTextLength = 20;

    private const string StartText = """
        Привет. Я Падаван – бот сообщества «Тимлид не кодит».

        Через меня можно задать вопрос в общий чат анонимно. Это нужно, когда в чате
        сидят ваши коллеги и руководитель, а спросить хочется по-настоящему.

        Как это работает:
        1. Пишете мне вопрос прямо сюда, одним сообщением.
        2. Админ проверяет его и публикует в чате от моего имени.
        3. Чат обсуждает. Кто прислал – не видит никто, включая админов.

        Что я храню: только текст. Ни вашего имени, ни id, ни username – в базе их нет.
        Пересылки тоже нет: в чат уходит новое сообщение от меня, без следов автора.

        Не верите на слово – проверьте код, он открыт:
        github.com/belyaevsa/teamleads-2025/tree/master/backend
        Файл Data/AnonRequest.cs – это все, что вообще сохраняется.

        Пишите вопрос. Или заполните форму на teamleads.kz/anon
        """;

    public static IEndpointRouteBuilder MapTelegramWebhook(this IEndpointRouteBuilder api)
    {
        api.MapPost("/tg/webhook/{secret}", async (
            string secret,
            HttpRequest request,
            AnonService anon,
            TelegramClient tg,
            IOptions<TelegramOptions> options,
            IConfiguration cfg,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var log = loggerFactory.CreateLogger("Telegram.Webhook");
            var opt = options.Value;

            if (!opt.Enabled) return Results.NotFound();

            // Both gates: the path segment (leaks via logs/proxies) and the header
            // (never logged). Either one wrong => 404, not 401 – an unauthenticated
            // prober learns nothing about whether this route exists.
            var headerToken = request.Headers["X-Telegram-Bot-Api-Secret-Token"].ToString();
            if (!FixedTimeEquals(secret, opt.WebhookSecret!) || !FixedTimeEquals(headerToken, opt.WebhookSecret!))
            {
                log.LogWarning("Rejected webhook call with a bad secret.");
                return Results.NotFound();
            }

            Update? update;
            try
            {
                update = await JsonSerializer.DeserializeAsync<Update>(request.Body, JsonOpts, ct);
            }
            catch (JsonException ex)
            {
                log.LogWarning(ex, "Unparseable webhook payload.");
                return Results.Ok();
            }

            try
            {
                if (update?.CallbackQuery is { } cb) await HandleCallbackAsync(cb, anon, tg, opt, ct);
                else if (update?.Message is { } msg) await HandleMessageAsync(msg, anon, tg, opt, cfg, ct);
            }
            catch (Exception ex)
            {
                // Swallow: a 500 here means Telegram redelivers this update forever.
                log.LogError(ex, "Webhook handling failed.");
            }

            return Results.Ok();
        })
        .WithName("TelegramWebhook")
        .ExcludeFromDescription();

        return api;
    }

    // ── messages ────────────────────────────────────────────────────────────

    private static async Task HandleMessageAsync(
        Message msg, AnonService anon, TelegramClient tg, TelegramOptions opt, IConfiguration cfg, CancellationToken ct)
    {
        var text = msg.Text?.Trim();
        if (string.IsNullOrEmpty(text)) return;

        // In the admin chat, a reply to an "✏️ Правка XXXX" prompt carries the new text.
        if (msg.Chat.Id == opt.AdminChatId)
        {
            if (EditTargetOf(msg.ReplyToMessage?.Text) is { } publicId)
            {
                var target = await anon.FindAsync(publicId, ct);
                var reply = target is null
                    ? $"Запрос {publicId} не найден."
                    : await anon.ApplyEditAsync(target, text, ct);
                await tg.SendMessageAsync(opt.AdminChatId, reply, ct: ct);
            }
            return;
        }

        // Anything outside a private chat is not ours (privacy mode keeps the bot
        // from seeing community chat messages anyway).
        if (!string.Equals(msg.Chat.Type, "private", StringComparison.Ordinal)) return;

        if (text.StartsWith("/start", StringComparison.Ordinal) || text.StartsWith("/help", StringComparison.Ordinal))
        {
            await tg.SendMessageAsync(msg.Chat.Id, StartText, ct: ct);
            return;
        }

        if (text.StartsWith("/status", StringComparison.Ordinal))
        {
            await HandleStatusAsync(msg, text, anon, tg, ct);
            return;
        }

        if (text.StartsWith('/')) return;   // unknown command: stay quiet

        if (text.Length < MinTextLength)
        {
            await tg.SendMessageAsync(msg.Chat.Id,
                "Слишком коротко. Опишите ситуацию хотя бы парой предложений – чату нужен контекст, чтобы ответить по делу.", ct: ct);
            return;
        }

        // The author's telegram id is hashed here and never stored raw. That is also
        // why we cannot notify them later – see /status below.
        var authorHash = ClientFingerprint.Hash($"tg|{msg.From?.Id}", cfg);
        var (_, row) = await anon.CreateAsync(text, "bot", authorHash, ct);

        await tg.SendMessageAsync(msg.Chat.Id, $"""
            Принято. Номер запроса: {row.PublicId}

            Админ проверит и опубликует его в чате анонимно. Я не сохранил ни ваш id,
            ни username – поэтому и написать вам о публикации не смогу.

            Проверить статус: /status {row.PublicId}
            """, ct: ct);
    }

    private static async Task HandleStatusAsync(Message msg, string text, AnonService anon, TelegramClient tg, CancellationToken ct)
    {
        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 2)
        {
            await tg.SendMessageAsync(msg.Chat.Id, "Формат: /status A7F3K2 – номер из ответа на ваш запрос.", ct: ct);
            return;
        }

        // The lookup is by the public id alone, which is exactly why it reveals
        // nothing: we cannot check that the asker is the author, and there is no
        // author to check against.
        var row = await anon.FindAsync(parts[1].ToUpperInvariant(), ct);
        await tg.SendMessageAsync(msg.Chat.Id,
            row is null
                ? "Запрос с таким номером не найден. Проверьте номер."
                : $"Запрос {row.PublicId}: {AnonService.StatusRu(row.Status)}.", ct: ct);
    }

    // ── callbacks ───────────────────────────────────────────────────────────

    private static async Task HandleCallbackAsync(
        CallbackQuery cb, AnonService anon, TelegramClient tg, TelegramOptions opt, CancellationToken ct)
    {
        // Only buttons pressed inside the admin chat count. Callback data is
        // attacker-controllable in general, so the chat check is the real gate.
        if (cb.Message?.Chat.Id != opt.AdminChatId)
        {
            await tg.AnswerCallbackQueryAsync(cb.Id, "Недоступно.", ct);
            return;
        }

        var parts = (cb.Data ?? "").Split(':');
        if (parts is not ["anon", var action, var publicId])
        {
            await tg.AnswerCallbackQueryAsync(cb.Id, ct: ct);
            return;
        }

        var row = await anon.FindAsync(publicId, ct);
        if (row is null)
        {
            await tg.AnswerCallbackQueryAsync(cb.Id, "Запрос не найден.", ct);
            return;
        }

        var adminId = cb.From?.Id ?? 0;
        var answer = action switch
        {
            "pub" => await anon.PublishAsync(row, adminId, ct),
            "rej" => await anon.RejectAsync(row, adminId, ct),
            "edit" => await PromptEditAsync(row.PublicId, tg, opt, ct),
            _ => "",
        };

        await tg.AnswerCallbackQueryAsync(cb.Id, answer, ct);
    }

    private static async Task<string> PromptEditAsync(string publicId, TelegramClient tg, TelegramOptions opt, CancellationToken ct)
    {
        await tg.SendMessageAsync(opt.AdminChatId, $"""
            ✏️ Правка {publicId}
            Ответьте на это сообщение новым текстом – он заменит исходный.
            Обычный случай: убрать детали, по которым автора можно вычислить.
            """, ct: ct);
        return "Ответьте на сообщение ниже.";
    }

    // Pulls the request id out of the prompt we sent, so the edit flow needs no
    // extra state (no "awaiting reply" column, nothing to expire).
    private static string? EditTargetOf(string? promptText)
    {
        const string marker = "✏️ Правка ";
        if (promptText is null || !promptText.StartsWith(marker, StringComparison.Ordinal)) return null;
        var id = promptText[marker.Length..].Split('\n', 2)[0].Trim();
        return id.Length is > 0 and <= 12 ? id : null;
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    // ── payloads ────────────────────────────────────────────────────────────
    // Only the fields we act on. Telegram adds fields constantly; unknown ones
    // are ignored, and nothing here is persisted beyond the hashed author id.

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private sealed record Update(
        [property: JsonPropertyName("message")] Message? Message,
        [property: JsonPropertyName("callback_query")] CallbackQuery? CallbackQuery);

    private sealed record Message(
        [property: JsonPropertyName("message_id")] long MessageId,
        [property: JsonPropertyName("chat")] Chat Chat,
        [property: JsonPropertyName("from")] User? From,
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("reply_to_message")] Message? ReplyToMessage);

    private sealed record Chat(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("type")] string Type);

    private sealed record User([property: JsonPropertyName("id")] long Id);

    private sealed record CallbackQuery(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("from")] User? From,
        [property: JsonPropertyName("data")] string? Data,
        [property: JsonPropertyName("message")] Message? Message);
}
