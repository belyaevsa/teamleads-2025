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
    public Task<Result> SendMessageAsync(long chatId, string text, object? replyMarkup = null, CancellationToken ct = default) =>
        CallAsync("sendMessage", new
        {
            chat_id = chatId,
            text,
            disable_web_page_preview = true,
            reply_markup = replyMarkup,
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

    public Task<Result> SetWebhookAsync(string url, string secretToken, CancellationToken ct = default) =>
        CallAsync("setWebhook", new
        {
            url,
            secret_token = secretToken,
            allowed_updates = new[] { "message", "callback_query" },
            drop_pending_updates = true,
        }, ct);

    private async Task<Result> CallAsync(string method, object payload, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_opt.BotToken))
            return Result.Fail("TG_BOT_TOKEN is not configured");

        try
        {
            // The leading slash matters: a bot token contains a colon ("8314549598:AA…"),
            // so a relative "bot8314549598:AA…/sendMessage" parses as a URI with scheme
            // "bot8314549598" and every call dies with "scheme is not supported".
            using var resp = await http.PostAsJsonAsync($"/bot{_opt.BotToken}/{method}", payload, Json, ct);
            var body = await resp.Content.ReadFromJsonAsync<ApiResponse>(cancellationToken: ct);

            if (body is { Ok: true })
                return new Result(true, MessageIdOf(body.Result), null);

            // description is Telegram's human-readable reason ("chat not found", "bot was blocked", …)
            var error = body?.Description ?? $"HTTP {(int)resp.StatusCode}";
            log.LogWarning("Telegram {Method} failed: {Error}", method, error);
            return Result.Fail(error);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Telegram {Method} threw.", method);
            return Result.Fail(ex.Message);
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
