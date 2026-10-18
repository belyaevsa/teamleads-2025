using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace TeamleadsBackend.Transcription;

// The two OpenRouter calls the voice feature makes: speech to text, then text to text.
// Hand-rolled over the typed HttpClient for the same reason TelegramClient is – two
// endpoints are not worth a dependency.
//
// Every call returns a result instead of throwing. A provider outage, an exhausted
// balance or a timeout is an expected condition: the worker turns it into a retry, and
// after the last one into an honest "не получилось" in the chat.
//
// Nothing here logs what was said. The audio and the text are the user's content; the
// log gets sizes, model ids, cost and error messages, the same rule the webhook keeps.
public sealed class OpenRouterClient(HttpClient http, IOptions<OpenRouterOptions> options, ILogger<OpenRouterClient> log)
{
    private readonly OpenRouterOptions _opt = options.Value;

    // Cost is OpenRouter's own usage.cost in USD – what the call actually billed, read off
    // the response rather than estimated from a price list that changes under us.
    public readonly record struct Result(bool Ok, string? Text, decimal Cost, string? Error)
    {
        public static Result Fail(string error) => new(false, null, 0, error);
    }

    // Multipart, not the base64 JSON form. Base64 adds a third, and OpenRouter refuses a
    // JSON body over 25 MB for every provider but OpenAI's and Groq's – a 15-minute voice
    // at Telegram's bitrate comes within a few megabytes of that once encoded. The raw
    // upload has the same 25 MB cap and Telegram already stops the bot at 20 MB.
    //
    // No `language`: the model detects it, and the community switches between Russian,
    // Kazakh and English mid-sentence, which a fixed language would transcribe worse.
    public async Task<Result> TranscribeAsync(byte[] audio, string fileName, string model, CancellationToken ct)
    {
        // Shaped like curl's body, not .NET's default. Out of the box MultipartFormDataContent
        // quotes the boundary, leaves `name=` unquoted and adds a `filename*=` – and
        // OpenRouter answers that with "Invalid multipart/form-data body" for small uploads
        // (a 9-second voice) while accepting large ones, which is how it got past a live
        // test on a 7-minute file and failed on the first real voice in the chat.
        var boundary = $"----teamleads{Guid.NewGuid():N}";
        using var form = new MultipartFormDataContent(boundary);
        form.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/form-data; boundary={boundary}");

        var file = new ByteArrayContent(audio);
        file.Headers.ContentType = new MediaTypeHeaderValue("audio/ogg");
        file.Headers.TryAddWithoutValidation("Content-Disposition", $"form-data; name=\"file\"; filename=\"{fileName}\"");
        form.Add(file);

        var modelPart = new StringContent(model);
        modelPart.Headers.ContentType = null;
        modelPart.Headers.TryAddWithoutValidation("Content-Disposition", "form-data; name=\"model\"");
        form.Add(modelPart);

        var (ok, body, error) = await PostAsync("audio/transcriptions", form, model, ct);
        if (!ok) return Result.Fail(error!);

        var text = body.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
        return new Result(true, text ?? "", CostOf(body), null);
    }

    // One system prompt, one user message, no history. Reasoning is off: restructuring a
    // transcript is editing, not problem solving, and thinking tokens would only make it
    // slower and dearer.
    //
    // A reply cut off at max_tokens is reported as a failure rather than returned: half a
    // document published as if it were the whole one is worse than the unedited transcript
    // the worker falls back to.
    public async Task<Result> CompleteAsync(string model, string system, string user, int maxTokens, CancellationToken ct)
    {
        var payload = new
        {
            model,
            messages = new object[]
            {
                new { role = "system", content = system },
                new { role = "user", content = user },
            },
            temperature = 0.3,
            max_tokens = maxTokens,
            reasoning = new { enabled = false },
        };

        using var content = JsonContent.Create(payload);
        var (ok, body, error) = await PostAsync("chat/completions", content, model, ct);
        if (!ok) return Result.Fail(error!);

        if (!body.TryGetProperty("choices", out var choices) || choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0)
            return Result.Fail("в ответе нет choices");

        var choice = choices[0];
        if (choice.TryGetProperty("finish_reason", out var finish) && finish.ValueKind == JsonValueKind.String
            && finish.GetString() == "length")
            return Result.Fail($"ответ обрезан на {maxTokens} токенах");

        var text = choice.TryGetProperty("message", out var message)
            && message.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String
                ? c.GetString()
                : null;
        return string.IsNullOrWhiteSpace(text)
            ? Result.Fail("пустой ответ модели")
            : new Result(true, text, CostOf(body), null);
    }

    private async Task<(bool Ok, JsonElement Body, string? Error)> PostAsync(
        string path, HttpContent content, string model, CancellationToken ct)
    {
        if (!_opt.Enabled) return (false, default, "OPENROUTER_API_KEY is not configured");

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = content };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opt.ApiKey);
            // OpenRouter's app attribution: which site the traffic on this key is for.
            request.Headers.TryAddWithoutValidation("HTTP-Referer", "https://teamleads.kz");
            request.Headers.TryAddWithoutValidation("X-Title", "teamleads.kz");

            using var response = await http.SendAsync(request, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            JsonElement body;
            try { body = JsonDocument.Parse(raw).RootElement.Clone(); }
            catch (JsonException)
            {
                log.LogWarning("OpenRouter {Path} ({Model}) answered HTTP {Status} with a non-JSON body.",
                    path, model, (int)response.StatusCode);
                return (false, default, $"HTTP {(int)response.StatusCode}");
            }

            // Errors come as {"error":{"message":…,"code":…}}, sometimes with a 200.
            if (!response.IsSuccessStatusCode || body.TryGetProperty("error", out _))
            {
                var error = ErrorOf(body) ?? $"HTTP {(int)response.StatusCode}";
                log.LogWarning("OpenRouter {Path} ({Model}) failed: {Error}", path, model, error);
                return (false, default, error);
            }

            return (true, body, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;   // shutdown, not a slow provider – see TelebotChatSender.CallAsync
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "OpenRouter {Path} ({Model}) threw.", path, model);
            return (false, default, ex.Message);
        }
    }

    private static string? ErrorOf(JsonElement body) =>
        body.TryGetProperty("error", out var e)
            ? e.ValueKind == JsonValueKind.Object && e.TryGetProperty("message", out var m) ? m.GetString() : e.ToString()
            : null;

    private static decimal CostOf(JsonElement body) =>
        body.TryGetProperty("usage", out var usage)
        && usage.TryGetProperty("cost", out var cost)
        && cost.TryGetDecimal(out var value)
            ? value
            : 0;
}
