using System.Net;
using System.Text;
using System.Text.Json;

namespace TeamleadsBackend.Tests.Support;

// A fake Bot API endpoint sitting under HttpClient.
//
// The point of these tests is the wire: what TelegramClient actually PUTs on the socket
// is the contract a replacement package has to reproduce. Asserting on the captured
// request body catches "the new client sends reply_markup as a string" – the class of
// break that compiles, deploys, and only shows up as a keyboard that stopped rendering.
public sealed class StubBotApi : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

    public List<Call> Calls { get; } = [];
    public Call LastCall => Calls.Count > 0 ? Calls[^1] : throw new InvalidOperationException("No call was made.");

    public sealed record Call(string Path, string Body)
    {
        // Parsed lazily so a test that only cares about the path doesn't pay for it.
        public JsonElement Json => JsonDocument.Parse(Body).RootElement;

        // Bot API method name – the last path segment of /bot<token>/<method>.
        public string Method => Path[(Path.LastIndexOf('/') + 1)..];

        public string? String(string property) =>
            Json.TryGetProperty(property, out var v) && v.ValueKind is JsonValueKind.String ? v.GetString() : null;

        public long? Long(string property) =>
            Json.TryGetProperty(property, out var v) && v.ValueKind is JsonValueKind.Number ? v.GetInt64() : null;

        public bool? Bool(string property) =>
            Json.TryGetProperty(property, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? v.GetBoolean()
                : null;

        public bool Has(string property) => Json.TryGetProperty(property, out _);
    }

    // `ok: true` with an arbitrary result payload. `messageId` 0 means "no message in
    // the result" – what answerCallbackQuery and setWebhook really return (`result: true`).
    public StubBotApi RespondsOk(long messageId = 0, string? rawResult = null)
    {
        var result = rawResult ?? (messageId == 0 ? "true" : $$"""{"message_id":{{messageId}}}""");
        return Responds(HttpStatusCode.OK, $$"""{"ok":true,"result":{{result}}}""");
    }

    // Telegram's own failure shape: 200 or 4xx carrying ok:false plus a description.
    public StubBotApi RespondsError(string description, HttpStatusCode status = HttpStatusCode.BadRequest) =>
        Responds(status, $$"""{"ok":false,"error_code":400,"description":{{JsonSerializer.Serialize(description)}}}""");

    public StubBotApi Responds(HttpStatusCode status, string body)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        });
        return this;
    }

    // Transport-level death: DNS failure, connection reset, TLS error. Distinct from an
    // API error because it never produces a body to read a description out of.
    public StubBotApi Throws(Exception? ex = null)
    {
        _responses.Enqueue(_ => throw ex ?? new HttpRequestException("connection reset"));
        return this;
    }

    // Body that is 200 OK but not the JSON envelope the client expects.
    public StubBotApi RespondsGarbage() => Responds(HttpStatusCode.OK, "<html>502 Bad Gateway</html>");

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        Calls.Add(new Call(request.RequestUri!.AbsolutePath, body));

        // Default to success so a test that only asserts on the request doesn't have to
        // set up a response it never looks at.
        var next = _responses.Count > 0
            ? _responses.Dequeue()
            : _ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"ok":true,"result":{"message_id":1}}""", Encoding.UTF8, "application/json"),
            };

        return next(request);
    }
}
