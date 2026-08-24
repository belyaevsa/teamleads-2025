using System.Net;
using Telebot;
using TeamleadsBackend.Telegram;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// Telebot one layer below its contract tests: the real DefaultTelegramTransport under a
// real socket, not the stub seam.
//
// The contract tests hand the adapter constructed .NET objects through
// StubTelebotTransport, which pins everything the library BUILDS but takes its word for
// everything it PARSES. That word is what a package bump can break silently: the response
// envelope (ok / error_code / result), the Poll model's own JSON names, and the
// "HTTP error 400: <body>" exception text that MigrateToChatIdOf digs the new chat id
// out of. None of it shows up at the stub, and none of it stops a build. So this suite
// points the transport at LocalBotApi – an HttpListener on 127.0.0.1, the one seam the
// transport leaves open, since it owns its HttpClient outright.
public sealed class TelebotTransportWireTests : IDisposable
{
    private readonly LocalBotApi _api = new();

    public void Dispose() => _api.Dispose();

    // The production adapter over the real transport. The BaseAddress is the only thing
    // about this that is not production; the timeout is generous because tests are not
    // about the timeout.
    private TelebotChatSender Sender() => new(new Telebot.Telegram(
        new DefaultTelegramTransport(new DefaultTransportOptions
        {
            BaseAddress = new Uri(_api.BaseAddress),
            Timeout = TimeSpan.FromSeconds(10),
        }),
        "TEST:token"));

    // What Telegram really answers stopPoll with: the whole poll, options in order with
    // their counts. Only the counts reach the port, but the surrounding members are on
    // the wire and the model has to carry them without losing the ones it cares about –
    // a renamed voter_count would deserialize to 0s and pass every stub-level test.
    private const string ClosedPoll = """
        {"id":"510","question":"?","options":[{"text":"а","voter_count":3},{"text":"б","voter_count":1}],"total_voter_count":4,"is_closed":true,"is_anonymous":true,"type":"regular","allows_multiple_answers":false}
        """;

    [Fact]
    public async Task StopPoll_reads_the_tally_out_of_a_real_response_body()
    {
        _api.RespondsOk(ClosedPoll);

        var outcome = await Sender().StopPollAsync(new ChatPollStop(-100500, 555), CancellationToken.None);

        Assert.True(outcome.Ok);
        // In option order, straight off the JSON: 3 and 1, not 0 and 0.
        Assert.Equal(new[] { 3, 1 }, outcome.Votes);

        // The request the real transport actually sent: /bot<token>/stopPoll with the
        // fields form-encoded. The stub pins which fields exist; this pins that they
        // survive an actual HTTP POST.
        var call = _api.LastCall;
        Assert.Equal("/botTEST:token/stopPoll", call.Path);
        Assert.Equal("-100500", call.Fields["chat_id"]);
        Assert.Equal("555", call.Fields["message_id"]);
    }

    // A refusal has to arrive carrying its description, because PollOutcome.Failed's
    // error is the only place the reason is kept – the service logs it and moves on.
    // This exercises the transport's failure framing end to end: a non-2xx status
    // becomes TelebotException("HTTP error 400: <body>") over real HTTP, and the
    // adapter's catch-all is what turns it into the outcome.
    [Fact]
    public async Task A_refusal_arrives_still_carrying_its_reason()
    {
        _api.RespondsError("Bad Request: poll has already been closed");

        var outcome = await Sender().StopPollAsync(new ChatPollStop(-100500, 555), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Null(outcome.Votes);
        Assert.Contains("poll has already been closed", outcome.Error);
    }

    // The migration path end to end. Every other test of MigrateToChatIdOf feeds it a
    // string copied from a production log; this one makes the real transport produce
    // that string, over a real socket, from the body Telegram really sends. If a package
    // version changed the exception's format – the prefix, the body, the status code –
    // this is where it stops being a production surprise.
    [Fact]
    public async Task A_supergroup_upgrade_travels_from_the_response_body_to_the_outcome()
    {
        _api.Responds(HttpStatusCode.BadRequest,
            """{"ok":false,"error_code":400,"description":"Bad Request: group chat was upgraded to a supergroup chat","parameters":{"migrate_to_chat_id":-1004294696151}}""");

        var outcome = await Sender().SendMessageAsync(new ChatMessage(-100500, "hi"), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Equal(-1004294696151, outcome.MigrateToChatId);
        Assert.NotNull(outcome.Error);
    }
}
