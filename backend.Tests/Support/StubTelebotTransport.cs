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
//
// 0.0.75 added DownloadAsync to the same interface, for getFile's DownloadFileAsync. No
// call in this app downloads files, so the stub answers it with the one thing a test can
// do with an unimplemented path: fail loudly.
public sealed class StubTelebotTransport : ITelegramTransport
{
    private readonly Queue<Func<TelegramRequest, object>> _responses = new();

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

    // The answer stopPoll gets: a closed poll whose options carry these voter counts, in
    // option order.
    public StubTelebotTransport StopsPoll(params int[] voterCounts)
    {
        _responses.Enqueue(_ => voterCounts);
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

        var scripted = _responses.Count > 0 ? _responses.Dequeue()(requestParams) : 1L;

        // The three answer shapes Telegram really uses: a Message, a bare `true` for the
        // calls that have nothing to return (answerCallbackQuery, setWebhook), and a Poll
        // with its final tally for stopPoll.
        object result = scripted switch
        {
            int[] counts => PollWithCounts(counts),
            long messageId => typeof(T) == typeof(bool) ? true : MessageWithId((int)messageId),
            _ => scripted,
        };
        return Task.FromResult((T)result);
    }

    public Task<Stream> DownloadAsync(Telebot.Models.File file, string token, CancellationToken cancellationToken) =>
        throw new NotSupportedException("No test downloads files.");

    // Only MessageId and Text are ever read back; the rest of the 16 members exist because
    // the record demands them.
    private static Message MessageWithId(int messageId) => new(
        messageId, null, null, null, null, null, 0, null,
        new Chat(0, "supergroup", null, null, null, null, null, null),
        null, null, null, null, null, "", null);

    // Only the options' VoterCounts are ever read back; the rest is what a closed regular
    // anonymous poll looks like, which is the only poll this bot posts.
    private static Poll PollWithCounts(int[] counts) => new(
        "p1", "?", counts.Select(c => new PollOption("", c)).ToList(),
        TotalVoterCount: counts.Sum(),
        IsClosed: true, IsAnonymous: true, Type: "regular", AllowsMultipleAnswers: false);
}
