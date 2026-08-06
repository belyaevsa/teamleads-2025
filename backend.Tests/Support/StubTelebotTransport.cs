using Telebot;
using Telebot.Models;

namespace TeamleadsBackend.Tests.Support;

// A fake socket under Bucketlab.Telebot, the way StubBotApi is one under TelegramClient.
//
// 0.0.6 had no seam here – its transport owned a private static HttpClient hardcoded to
// api.telegram.org – so the Telebot contract tests had to fake ITelegramClient itself and
// take the library's word for what it would have sent. 0.0.7 accepts an ITelegramTransport,
// so the real client now builds the real request objects and this records them. The
// difference is not cosmetic: request construction is exactly where an upgrade breaks.
public sealed class StubTelebotTransport : ITelegramTransport
{
    private readonly Queue<Func<TelegramRequest, long>> _responses = new();

    public List<TelegramRequest> Requests { get; } = [];

    public TelegramRequest Last =>
        Requests.Count > 0 ? Requests[^1] : throw new InvalidOperationException("No request was made.");

    // The Bot API method name, from the request's own endpoint.
    public string LastEndpoint => Last.Endpoint;

    // Every field the library decided to put on the wire, by its Bot API name. Composite
    // ones (reply_markup, link_preview_options, reply_parameters) arrive as JSON text.
    public IReadOnlyDictionary<string, string> LastFields =>
        Last.GetRequestFields().ToDictionary(f => f.Name, f => f.Value ?? "");

    public StubTelebotTransport Delivers(long messageId)
    {
        _responses.Enqueue(_ => messageId);
        return this;
    }

    public StubTelebotTransport Throws(Exception ex)
    {
        _responses.Enqueue(_ => throw ex);
        return this;
    }

    public Task<T> RequestAsync<T>(TelegramRequest requestParams, string token, CancellationToken cancellationToken)
    {
        Requests.Add(requestParams);

        var messageId = _responses.Count > 0 ? _responses.Dequeue()(requestParams) : 1;

        // The two answer shapes Telegram really uses: a Message, or a bare `true` for the
        // calls that have nothing to return (answerCallbackQuery, setWebhook).
        object result = typeof(T) == typeof(bool) ? true : MessageWithId((int)messageId);
        return Task.FromResult((T)result);
    }

    // Only MessageId and Text are ever read back; the rest of the 16 members exist because
    // the record demands them.
    private static Message MessageWithId(int messageId) => new(
        messageId, null, null, null, null, null, 0, null,
        new Chat(0, "supergroup", null, null, null, null, null, null),
        null, null, null, null, null, "", null);
}
