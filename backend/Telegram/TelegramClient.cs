using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace TeamleadsBackend.Telegram;

// Minimal Bot API client: the four methods this feature needs, over the typed
// HttpClient registered in Program.cs. Not worth a third-party dependency.
//
// Every call returns a result object instead of throwing – a Telegram outage or
// a bot kicked from the chat is an expected condition here, and the caller turns
// it into an "ошибка публикации" card rather than a 500.
public sealed class TelegramClient(HttpClient http, IOptions<TelegramOptions> options, ILogger<TelegramClient> log)
{
    private readonly TelegramOptions _opt = options.Value;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public readonly record struct Result(bool Ok, long MessageId, string? Error)
    {
        public static Result Fail(string error) => new(false, 0, error);
    }

    // Text is sent with no parse_mode on purpose: user input must never be
    // interpreted as markup, or a submitter could smuggle in a hidden
    // tg://user?id= mention and deanonymize themselves (or fake a quote).
    // `replyToMessageId` threads the answer under the message it is about – used by
    // /paste in the community chat so the link lands on the wall of text it replaces.
    // allow_sending_without_reply: the original may already be deleted, and a lost
    // reply target must not turn into a lost answer.
    // Previews stay off by default – a moderation card full of links should not turn
    // into a wall of cards. /paste opts back in: the preview is where Telegram draws
    // the Instant View button.
    public Task<Result> SendMessageAsync(long chatId, string text, object? replyMarkup = null,
        long? replyToMessageId = null, bool disablePreview = true, CancellationToken ct = default) =>
        CallAsync("sendMessage", new
        {
            chat_id = chatId,
            text,
            disable_web_page_preview = disablePreview,
            reply_markup = replyMarkup,
            reply_to_message_id = replyToMessageId,
            allow_sending_without_reply = replyToMessageId is null ? (bool?)null : true,
        }, ct);

    public Task<Result> EditMessageTextAsync(long chatId, long messageId, string text, object? replyMarkup = null, CancellationToken ct = default) =>
        CallAsync("editMessageText", new
        {
            chat_id = chatId,
            message_id = messageId,
            text,
            disable_web_page_preview = true,
            reply_markup = replyMarkup,
        }, ct);

    // Stops the spinner on the admin's button. Fire-and-forget by nature: if it
    // fails the decision has still been recorded, so we only log.
    public Task<Result> AnswerCallbackQueryAsync(string callbackQueryId, string? text = null, CancellationToken ct = default) =>
        CallAsync("answerCallbackQuery", new { callback_query_id = callbackQueryId, text }, ct);

    // A native poll. `correctOptionId` turns it into a quiz (Telegram then reveals the
    // right answer and the explanation itself); left null it stays a plain anonymous
    // poll, which is the point for a dilemma – no answer is "correct", and an anonymous
    // vote is exactly what someone who won't type in front of their boss will still do.
    public Task<Result> SendPollAsync(long chatId, string question, IEnumerable<string> options,
        int? correctOptionId = null, string? explanation = null, CancellationToken ct = default) =>
        CallAsync("sendPoll", new
        {
            chat_id = chatId,
            question,
            options = options.ToArray(),
            is_anonymous = true,
            type = correctOptionId is null ? "regular" : "quiz",
            correct_option_id = correctOptionId,
            explanation,
        }, ct);

    // Closes a poll and returns the final vote count per option, in option order.
    public async Task<int[]?> StopPollAsync(long chatId, long messageId, CancellationToken ct = default)
    {
        var (ok, result, _) = await CallJsonAsync("stopPoll", new { chat_id = chatId, message_id = messageId }, ct);
        if (!ok || result is not { ValueKind: JsonValueKind.Object } poll) return null;
        if (!poll.TryGetProperty("options", out var options)) return null;

        return options.EnumerateArray()
            .Select(o => o.TryGetProperty("voter_count", out var v) ? v.GetInt32() : 0)
            .ToArray();
    }

    // `button` is the strip Telegram draws above the result list (InlineQueryResultsButton).
    // It is the only way to say anything when there are no results – an empty list
    // renders as an empty popup, which reads as a broken bot.
    public Task<Result> AnswerInlineQueryAsync(string inlineQueryId, IEnumerable<object> results,
        int cacheTime = 300, object? button = null, CancellationToken ct = default) =>
        CallAsync("answerInlineQuery", new
        {
            inline_query_id = inlineQueryId,
            results = results.ToArray(),
            cache_time = cacheTime,
            button,
        }, ct);

    public Task<Result> SetWebhookAsync(string url, string secretToken, CancellationToken ct = default) =>
        CallAsync("setWebhook", new
        {
            url,
            secret_token = secretToken,
            allowed_updates = new[] { "message", "callback_query", "inline_query" },
            drop_pending_updates = true,
        }, ct);

    private async Task<Result> CallAsync(string method, object payload, CancellationToken ct)
    {
        var (ok, result, error) = await CallJsonAsync(method, payload, ct);
        return ok ? new Result(true, MessageIdOf(result), null) : Result.Fail(error ?? "unknown");
    }

    private async Task<(bool Ok, JsonElement? Result, string? Error)> CallJsonAsync(string method, object payload, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_opt.BotToken))
            return (false, null, "TG_BOT_TOKEN is not configured");

        try
        {
            // The leading slash matters: a bot token contains a colon ("8314549598:AA…"),
            // so a relative "bot8314549598:AA…/sendMessage" parses as a URI with scheme
            // "bot8314549598" and every call dies with "scheme is not supported".
            using var resp = await http.PostAsJsonAsync($"/bot{_opt.BotToken}/{method}", payload, Json, ct);
            var body = await resp.Content.ReadFromJsonAsync<ApiResponse>(cancellationToken: ct);

            if (body is { Ok: true })
                return (true, body.Result, null);

            // description is Telegram's human-readable reason ("chat not found", "bot was blocked", …)
            var error = body?.Description ?? $"HTTP {(int)resp.StatusCode}";
            log.LogWarning("Telegram {Method} failed: {Error}", method, error);
            return (false, null, error);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Telegram {Method} threw.", method);
            return (false, null, ex.Message);
        }
    }

    // `result` is not always a message – answerCallbackQuery/setWebhook return `true` –
    // so it stays a raw element and we pull message_id out only when there is one.
    private static long MessageIdOf(JsonElement? result) =>
        result is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty("message_id", out var id)
            ? id.GetInt64()
            : 0;

    private sealed record ApiResponse(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("description")] string? Description,
        [property: JsonPropertyName("result")] JsonElement? Result);
}
