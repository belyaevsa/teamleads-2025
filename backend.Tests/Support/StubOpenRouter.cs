using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Transcription;

namespace TeamleadsBackend.Tests.Support;

// A fake OpenRouter under HttpClient, the way StubBotApi is a fake Bot API.
//
// Records every request with its headers and body as sent, so a test can assert on what
// actually went over the wire – the multipart field names, the reasoning switch, the key
// in the Authorization header – and answers from a script, defaulting to an error so a
// test that forgets to script a call fails loudly instead of transcribing nothing.
public sealed class StubOpenRouter : HttpMessageHandler
{
    private readonly Queue<(HttpStatusCode Status, string Body)> _responses = new();

    public List<Call> Calls { get; } = [];

    // ContentTypeHeader is the header as sent, parameters and quoting included – the
    // boundary's quoting is part of what OpenRouter accepts or refuses.
    public sealed record Call(string Path, string? Authorization, string? ContentType, string Body, string? ContentTypeHeader = null);

    public StubOpenRouter Transcribes(string text, decimal cost = 0.0128m) =>
        Responds(HttpStatusCode.OK, JsonSerializer.Serialize(new { text, usage = new { seconds = 461, cost } }));

    public StubOpenRouter Completes(string content, decimal cost = 0.0025m, string finishReason = "stop") =>
        Responds(HttpStatusCode.OK, JsonSerializer.Serialize(new
        {
            id = "gen-1",
            provider = "Makora",
            choices = new[] { new { finish_reason = finishReason, message = new { role = "assistant", content } } },
            usage = new { prompt_tokens = 2191, completion_tokens = 1656, cost },
        }));

    // OpenRouter's own error envelope.
    public StubOpenRouter Fails(HttpStatusCode status, string message) =>
        Responds(status, JsonSerializer.Serialize(new { error = new { message, code = (int)status } }));

    public StubOpenRouter Responds(HttpStatusCode status, string body)
    {
        _responses.Enqueue((status, body));
        return this;
    }

    public OpenRouterClient Client(string? apiKey = "sk-or-test") =>
        new(new HttpClient(this) { BaseAddress = new Uri("https://openrouter.test/api/v1/") },
            Options.Create(new OpenRouterOptions { ApiKey = apiKey }),
            NullLogger<OpenRouterClient>.Instance);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        Calls.Add(new Call(request.RequestUri!.AbsolutePath, request.Headers.Authorization?.ToString(),
            request.Content?.Headers.ContentType?.MediaType, body, request.Content?.Headers.ContentType?.ToString()));

        var (status, json) = _responses.Count > 0
            ? _responses.Dequeue()
            : (HttpStatusCode.InternalServerError, """{"error":{"message":"no response scripted"}}""");
        return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}
