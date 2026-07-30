using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Search;
using TeamleadsBackend.Security;
using TeamleadsBackend.Settings;
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

        Что я умею:
        🔍 Поиск по архиву: наберите @temlead_helper_bot и ключевое слово в любом чате.

        📋 Paste: отправьте мне код, конфиг или длинный лог командой /paste. Я верну ссылку, которую можно отправить в чат. Если вставите в меня сообщение-простыню длиннее 300 символов, я сам предложу создать paste-ссылку. С пастой будет видно ваше имя – её, в отличие от анонимного вопроса, не нужно модерировать, и она не попадёт в общий чат.

        🎭 Анонимные вопросы: через меня можно задать вопрос в общий чат анонимно.

        Как работают анонимные вопросы:
        1. Пишете мне вопрос прямо сюда, одним сообщением.
        2. Админ проверяет его и публикует в чате от моего имени.
        3. Чат обсуждает. Кто прислал – не видит никто, включая админов.

        Что я храню: только текст. Ни вашего имени, ни id, ни username – в базе их нет.

        Не верите на слово – проверьте код, он открыт:
        github.com/belyaevsa/teamleads-2025/tree/master/backend
        """;

    public static IEndpointRouteBuilder MapTelegramWebhook(this IEndpointRouteBuilder api)
    {
        api.MapPost("/tg/webhook/{secret}", async (
            string secret,
            HttpRequest request,
            AnonService anon,
            DilemmaService dilemmas,
            QuestionService questions,
            SearchService search,
            AppDbContext db,
            SettingsService settings,
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
                // Resolved per update rather than at startup: moving the moderation
                // group is a settings change, not a redeploy. 0 means "not configured",
                // and no real chat id is 0, so every admin path is simply inert.
                var adminChat = await settings.GetLongAsync("tg.admin_chat_id", ct);

                if (update?.InlineQuery is { } inline) await HandleInlineQueryAsync(inline, search, tg, ct);
                else if (update?.CallbackQuery is { } cb) await HandleCallbackAsync(cb, anon, tg, adminChat, ct);
                else if (update?.Message is { } msg) await HandleMessageAsync(msg, anon, dilemmas, questions, search, db, settings, tg, adminChat, cfg, ct);
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
        Message msg, AnonService anon, DilemmaService dilemmas, QuestionService questions, SearchService search,
        AppDbContext db,
        SettingsService settings, TelegramClient tg,
        long adminChat, IConfiguration cfg, CancellationToken ct)
    {
        var text = msg.Text?.Trim();
        if (string.IsNullOrEmpty(text)) return;

        // Bootstrap helper, answered in ANY chat: reports the id of the chat it is called
        // from. Configuring tg.admin_chat_id otherwise means guessing whether a group is
        // -id or -100id, and a wrong guess fails as an indistinguishable "chat not found".
        // A chat id is not a secret – it grants nothing to someone who is already in the
        // chat – so this needs no gate.
        if (text.StartsWith("/id", StringComparison.Ordinal))
        {
            await tg.SendMessageAsync(msg.Chat.Id, $"""
                chat_id: {msg.Chat.Id}
                тип: {msg.Chat.Type}

                Прописать этот чат как админский:
                PUT /api/settings/tg.admin_chat_id  ->  {msg.Chat.Id}
                """, ct: ct);
            return;
        }

        // In the admin chat, a reply to an "✏️ Правка XXXX" prompt carries the new text.
        if (adminChat != 0 && msg.Chat.Id == adminChat)
        {
            // Manual triggers for the weekly dilemma – the same code the scheduler runs,
            // so what you test by hand is what fires on Monday.
            if (text.StartsWith("/dilemma", StringComparison.Ordinal))
            {
                await tg.SendMessageAsync(adminChat, await dilemmas.PostAsync(ct), ct: ct);
                return;
            }
            if (text.StartsWith("/reveal", StringComparison.Ordinal))
            {
                await tg.SendMessageAsync(adminChat, await dilemmas.FollowUpAsync(TimeSpan.Zero, ct), ct: ct);
                return;
            }
            if (text.StartsWith("/question", StringComparison.Ordinal))
            {
                await tg.SendMessageAsync(adminChat, await questions.PostAsync(ct), ct: ct);
                return;
            }
            if (text.StartsWith("/set", StringComparison.Ordinal))
            {
                await HandleSettingsAsync(msg, text, settings, tg, adminChat, ct);
                return;
            }

            if (EditTargetOf(msg.ReplyToMessage?.Text) is { } publicId)
            {
                var target = await anon.FindAsync(publicId, ct);
                var reply = target is null
                    ? $"Запрос {publicId} не найден."
                    : await anon.ApplyEditAsync(target, text, ct);
                await tg.SendMessageAsync(adminChat, reply, ct: ct);
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

        if (text.StartsWith("/search", StringComparison.Ordinal) || text.StartsWith("/find", StringComparison.Ordinal))
        {
            await HandleSearchAsync(msg, text, search, tg, ct);
            return;
        }

        if (text.StartsWith("/paste", StringComparison.Ordinal))
        {
            await HandlePasteWebhookAsync(msg, text, db, cfg, tg, ct);
            return;
        }

        if (text.StartsWith('/')) return;   // unknown command: stay quiet

        // Code/log detection: a wall of text (300+ chars) with code-like patterns.
        // Suggest paste instead of silently turning it into an anonymous question.
        if (text.Length >= 300 && LooksLikeCode(text))
        {
            await tg.SendMessageAsync(msg.Chat.Id,
                "Похоже на код, конфиг или лог.\n\nОтправьте /paste чтобы создать ссылку – она будет с вашим именем. Или повторите это же сообщение, если хотите отправить его как анонимный вопрос в чат.", ct: ct);
            return;
        }

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

    // Runtime settings from the admin chat: `/set` lists them with their effective
    // values, `/set <key> <value>` changes one. This is the point of moving settings
    // into the database – turning the bot off is a message, not a deploy.
    private static async Task HandleSettingsAsync(
        Message msg, string text, SettingsService settings, TelegramClient tg, long adminChat, CancellationToken ct)
    {
        var parts = text.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length < 3)
        {
            var lines = new List<string> { "⚙️ Настройки бота", "" };
            foreach (dynamic s in await settings.DescribeAsync(ct))
                lines.Add($"{s.key} = {s.value}  ({s.source})\n    {s.Description}");
            lines.Add("");
            lines.Add("Изменить: /set <ключ> <значение>");
            await tg.SendMessageAsync(adminChat, string.Join("\n", lines), ct: ct);
            return;
        }

        var error = await settings.SetAsync(parts[1], parts[2], msg.From?.Id, ct);
        await tg.SendMessageAsync(adminChat,
            error ?? $"✅ {parts[1]} = {parts[2]}. Применится в течение 5 минут (кэш настроек).", ct: ct);
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
        CallbackQuery cb, AnonService anon, TelegramClient tg, long adminChat, CancellationToken ct)
    {
        // Only buttons pressed inside the admin chat count. Callback data is
        // attacker-controllable in general, so the chat check is the real gate.
        if (adminChat == 0 || cb.Message?.Chat.Id != adminChat)
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
            "edit" => await PromptEditAsync(row.PublicId, tg, adminChat, ct),
            _ => "",
        };

        await tg.AnswerCallbackQueryAsync(cb.Id, answer, ct);
    }

    private static async Task<string> PromptEditAsync(string publicId, TelegramClient tg, long adminChat, CancellationToken ct)
    {
        await tg.SendMessageAsync(adminChat, $"""
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

    // ── search ──────────────────────────────────────────────────────────────

    private const string SiteUrl = "https://teamleads.kz/";

    // Opens a private chat with the bot from the inline results strip. start_parameter
    // is required for the button to appear at all; the bot answers /start either way.
    private static object PmButton(string text) => new { text, start_parameter = "search" };

    private static async Task HandleInlineQueryAsync(
        InlineQuery inline, SearchService search, TelegramClient tg, CancellationToken ct)
    {
        var query = inline.Query?.Trim() ?? "";

        // Nothing typed yet: no results to show, but the button explains what this is.
        // cache_time 0 – the next keystroke must re-query, not reuse this answer.
        if (string.IsNullOrWhiteSpace(query))
        {
            await tg.AnswerInlineQueryAsync(inline.Id, [], cacheTime: 0,
                button: PmButton("Поиск по архиву: наберите запрос"), ct: ct);
            return;
        }

        var hits = await search.SearchAsync(query, limit: 10, ct: ct);

        // No hits (or the index failed to load). One card, so the user sees an answer
        // instead of an empty popup, and a button into the bot – "не нашлось" is
        // exactly when someone should be asking the chat instead.
        if (hits.Count == 0)
        {
            await tg.AnswerInlineQueryAsync(inline.Id, [new
            {
                type = "article",
                id = "empty",
                title = $"Ничего не найдено по «{query}»",
                description = "Отправить ссылку на архив сообщества",
                url = SiteUrl,
                input_message_content = new
                {
                    message_text = $"🔍 По запросу «{query}» в архиве ничего не нашлось.\n\nВесь архив: {SiteUrl}",
                    disable_web_page_preview = false,
                },
            }], cacheTime: 30, button: PmButton("Не нашлось? Спросите чат анонимно"), ct: ct);
            return;
        }
        var results = hits.Select((h, i) => new
        {
            type = "article",
            // Ids only have to be unique within one answer. Hashing the url added
            // nothing and Math.Abs(int.MinValue) throws.
            id = $"s{i}",
            title = $"{h.Section}: {h.Title}",
            description = h.Snippet,
            url = h.Url,
            // No parse_mode, like every other message this bot sends: the snippet is
            // raw article prose and will eventually contain a stray _ or * that makes
            // Telegram reject the whole result with "can't parse entities".
            input_message_content = new
            {
                message_text = $"{h.Section} {h.Title}\n\n{h.Snippet}\n\n🔗 {h.Url}",
                disable_web_page_preview = false,
            }
        }).ToList();

        await tg.AnswerInlineQueryAsync(inline.Id, results, cacheTime: 60, ct: ct);
    }

    private static async Task HandleSearchAsync(
        Message msg, string text, SearchService search, TelegramClient tg, CancellationToken ct)
    {
        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 2)
        {
            await tg.SendMessageAsync(msg.Chat.Id,
                "Укажите ключевые слова для поиска по архиву.\nПример: /search 1-on-1 или /find бас фактор", ct: ct);
            return;
        }

        var query = parts[1];
        var hits = await search.SearchAsync(query, limit: 5, ct: ct);

        if (hits.Count == 0)
        {
            await tg.SendMessageAsync(msg.Chat.Id,
                $"По запросу «{query}» ничего не найдено в архиве. Попробуйте сформулировать иначе.", ct: ct);
            return;
        }

        var lines = new List<string> { $"🔍 Результаты поиска по «{query}»:", "" };
        foreach (var h in hits)
        {
            lines.Add($"{h.Section} {h.Title}");
            if (!string.IsNullOrWhiteSpace(h.Snippet)) lines.Add($"   {h.Snippet}");
            lines.Add($"   {h.Url}");
            lines.Add("");
        }

        await tg.SendMessageAsync(msg.Chat.Id, string.Join("\n", lines).TrimEnd(), ct: ct);
    }

    // ── paste ────────────────────────────────────────────────────────────────

    private static async Task HandlePasteWebhookAsync(
        Message msg, string text, AppDbContext db, IConfiguration cfg, TelegramClient tg, CancellationToken ct)
    {
        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var content = parts.Length >= 2
            ? parts[1]
            : msg.ReplyToMessage?.Text;

        if (string.IsNullOrWhiteSpace(content))
        {
            await tg.SendMessageAsync(msg.Chat.Id,
                "Отправьте текст для paste:\n\n`/paste ваш код, лог или конфиг`\n\nИли ответьте этой командой на сообщение с текстом.", ct: ct);
            return;
        }

        if (content.Length < 10)
        {
            await tg.SendMessageAsync(msg.Chat.Id, "Слишком коротко. Минимум 10 символов.", ct: ct);
            return;
        }

        if (content.Length > 64 * 1024)
        {
            await tg.SendMessageAsync(msg.Chat.Id, "Слишком длинно. Максимум 64 КБ.", ct: ct);
            return;
        }

        var language = LanguageDetector.Detect(content);
        var publicId = await GeneratePasteIdAsync(db, ct);
        var authorName = (msg.From ?? new User(0)).GetDisplayName().Truncate(120);

        db.Pastes.Add(new Paste
        {
            PublicId = publicId,
            Content = content,
            Language = language,
            AuthorName = authorName,
            AuthorTgId = msg.From?.Id,
            Source = "bot",
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
        });
        await db.SaveChangesAsync(ct);

        await tg.SendMessageAsync(msg.Chat.Id,
            $"📋 Paste создан: https://teamleads.kz/p/{publicId}/\n\nЯзык: {LanguageLabel(language)}, автор: {authorName}", ct: ct);
    }

    private static bool LooksLikeCode(string text)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n');
        if (lines.Length < 3) return false;

        var specialCount = 0;
        var totalCount = 0;
        var longLineCount = 0;
        var braces = 0;

        foreach (var line in lines.Take(30))
        {
            totalCount += line.Length;
            if (line.Length > 80) longLineCount++;

            foreach (var ch in line)
            {
                if (ch is '{' or '}' or '[' or ']' or '(' or ')' or '=' or ':' or ';' or '<' or '>' or '|'
                    or '&' or '!' or '@' or '#' or '$' or '%' or '^' or '*' or '\\' or '"' or '\'')
                    specialCount++;
            }
            if (line.Contains('{') && line.Contains('}')) braces++;
        }

        var ratio = (double)specialCount / Math.Max(1, totalCount);
        var hasLongLines = longLineCount >= 2;
        var hasStructure = braces >= 3;

        return ratio > 0.03 || hasLongLines || hasStructure;
    }

    private static async Task<string> GeneratePasteIdAsync(AppDbContext db, CancellationToken ct)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var chars = new char[7];
            for (var i = 0; i < chars.Length; i++)
                chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
            var id = new string(chars);
            if (!await db.Pastes.AnyAsync(p => p.PublicId == id, ct)) return id;
        }

        var fallback = new char[12];
        for (var i = 0; i < fallback.Length; i++)
            fallback[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        return new string(fallback);
    }

    private static string LanguageLabel(string lang) => lang switch
    {
        "go" => "Go",
        "python" => "Python",
        "json" => "JSON",
        "yaml" => "YAML",
        "sql" => "SQL",
        "rust" => "Rust",
        "bash" => "Bash",
        "plaintext" => "code",
        _ => "text",
    };

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
        [property: JsonPropertyName("callback_query")] CallbackQuery? CallbackQuery,
        [property: JsonPropertyName("inline_query")] InlineQuery? InlineQuery);

    private sealed record InlineQuery(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("from")] User? From,
        [property: JsonPropertyName("query")] string Query);

    private sealed record Message(
        [property: JsonPropertyName("message_id")] long MessageId,
        [property: JsonPropertyName("chat")] Chat Chat,
        [property: JsonPropertyName("from")] User? From,
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("reply_to_message")] Message? ReplyToMessage);

    private sealed record Chat(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("type")] string Type);

    private sealed record User(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("first_name")] string FirstName = "",
        [property: JsonPropertyName("last_name")] string LastName = "")
    {
        public string GetDisplayName()
        {
            var name = $"{FirstName} {LastName}".Trim();
            return name.Length > 0 ? name : $"tg{Id}";
        }
    }

    private sealed record CallbackQuery(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("from")] User? From,
        [property: JsonPropertyName("data")] string? Data,
        [property: JsonPropertyName("message")] Message? Message);
}

file static class StringTruncate
{
    public static string Truncate(this string text, int limit) =>
        text.Length <= limit ? text : string.Concat(text.AsSpan(0, limit - 1), "…");
}
