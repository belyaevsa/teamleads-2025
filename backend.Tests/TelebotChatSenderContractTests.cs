using System.Text.Json;
using Telebot;
using TeamleadsBackend.Telegram;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// The Telebot adapter measured against the same contract as the hand-rolled one.
//
// The client under test is the real `Telebot.Telegram`, driven through a stub
// ITelegramTransport – a seam 0.0.7 added. Until then its transport owned a private
// static HttpClient hardcoded to api.telegram.org and the only observation point was a
// hand-written fake of ITelegramClient itself, which took the library's word for what it
// would have sent. Now the library builds the requests it really builds and this asserts
// on the fields it really emits, which is where an upgrade actually breaks.
public sealed class TelebotChatSenderContractTests : ChatSenderContractTests
{
    // One transport per TestHost, keyed so the abstract hooks can reach the same instance.
    private static readonly Dictionary<TestHost, StubTelebotTransport> Transports = [];

    private static StubTelebotTransport For(TestHost host) =>
        Transports.TryGetValue(host, out var t) ? t : Transports[host] = new StubTelebotTransport();

    protected override IChatSender CreateSender(TestHost host) =>
        new TelebotChatSender(new Telebot.Telegram(For(host), "TEST:token"));

    protected override void GivenDelivers(TestHost host, long messageId) =>
        For(host).Delivers(messageId);

    // Telebot reports an API refusal as a TelebotException carrying the description.
    protected override void GivenApiError(TestHost host, string description) =>
        For(host).Throws(new TelebotException(400, description));

    protected override void GivenTransportFailure(TestHost host, Exception ex) =>
        For(host).Throws(ex);

    // Telebot has no typed ResponseParameters – TelebotException carries a status code and
    // a message, and the message is the raw body behind an "HTTP error 400: " prefix. This
    // string is copied from the production log the day the admin group was upgraded, so
    // the adapter is measured against what the library really hands it.
    protected override void GivenChatMigrated(TestHost host, long newChatId) =>
        For(host).Throws(new TelebotException(400,
            $$$"""
            HTTP error 400: {"ok":false,"error_code":400,"description":"Bad Request: group chat was upgraded to a supergroup chat","parameters":{"migrate_to_chat_id":{{{newChatId}}}}}
            """));

    protected override void GivenStopsPoll(TestHost host, int[] voterCounts) =>
        For(host).StopsPoll(voterCounts);

    protected override IReadOnlyDictionary<string, string> SentFields(TestHost host) =>
        For(host).LastFields;

    protected override string SentMethod(TestHost host) => For(host).LastEndpoint;

    protected override JsonElement? SentReplyMarkup(TestHost host) => SentField(host, "reply_markup");

    // Bot API 7.0 replaced disable_web_page_preview with a link_preview_options object.
    // The adapter can express the intent, so the observation reads that object off the
    // wire – null when none was sent, is_disabled when one was.
    protected override bool? SentDisablePreview(TestHost host) =>
        SentField(host, "link_preview_options") is { } options
        && options.TryGetProperty("is_disabled", out var disabled)
            ? disabled.GetBoolean()
            : null;

    // Telebot-specific, and paid for in production.
    //
    // Through 0.0.71 the library serialized request models with nulls included, so the four
    // members of LinkPreviewOptions the adapter left unset went out as
    // `{"is_disabled":true,"url":null,…}` and Telegram refused the entire call:
    // `Bad Request: field "url" must be of type String`. The message that hit it was an
    // anon moderation card, which then burned its way down the backoff ladder and died.
    // 0.0.72 omits unset members instead, which is what let the adapter stop filling them
    // with stand-ins and what made a threaded reply safe to send at all – ReplyParameters
    // has seven optional members and no value for `quote` would have been a no-op.
    //
    // So this sweep is now a regression test on the package rather than a workaround's
    // guard, and it runs over every call shape the port can produce: each is an object with
    // optional members, and each is the same outage waiting to happen. Asserted against the
    // fields Telebot itself builds – only the bytes are what Telegram parses.
    [Fact]
    public async Task No_field_of_any_call_reaches_the_wire_holding_a_null()
    {
        using var host = new TestHost();
        var sender = CreateSender(host);
        const string keyboard = """
            {"inline_keyboard":[[{"text":"Опубликовать","callback_data":"anon:pub:A7F3K2"}]]}
            """;

        // Every shape the app really sends, including the two that carry a nested object
        // the adapter has to fill in completely.
        await sender.SendMessageAsync(new ChatMessage(-100500, "hi", keyboard, DisablePreview: true), default);
        AssertNoNulls(host, "sendMessage");

        await sender.SendMessageAsync(new ChatMessage(-100500, "hi", ReplyToMessageId: 50), default);
        AssertNoNulls(host, "sendMessage with a reply target");

        await sender.EditMessageTextAsync(new ChatEdit(-100500, 4242, "settled"), default);
        AssertNoNulls(host, "editMessageText");

        await sender.SendPollAsync(new ChatPoll(-100500, "?", ["а", "б"]), default);
        AssertNoNulls(host, "sendPoll");

        await sender.StopPollAsync(new ChatPollStop(-100500, 42), default);
        AssertNoNulls(host, "stopPoll");

        await sender.AnswerCallbackAsync(new CallbackAnswer("cb1"), default);
        AssertNoNulls(host, "answerCallbackQuery with no text");
    }

    private static void AssertNoNulls(TestHost host, string what)
    {
        var offenders = For(host).LastFields
            .SelectMany(f => AsJson(f.Value) is { } json
                ? NullFieldsIn(json).Select(n => $"{f.Key}.{n}")
                : [])
            .ToArray();

        Assert.True(offenders.Length == 0, $"{what} carries nulls: {string.Join(", ", offenders)}");
    }

    // Telebot renders each field's value as a string; only the composite ones are JSON.
    private static JsonElement? AsJson(string? value)
    {
        if (value is null || !value.StartsWith('{')) return null;
        return JsonDocument.Parse(value).RootElement;
    }

    private static JsonElement? SentField(TestHost host, string name) =>
        For(host).LastFields.TryGetValue(name, out var value) ? AsJson(value) : null;

    // Names of null-valued properties, at any depth – a null nested inside an inline
    // keyboard button is rejected exactly as hard as one at the top level.
    private static IEnumerable<string> NullFieldsIn(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Object => element.EnumerateObject().SelectMany(p =>
            p.Value.ValueKind == JsonValueKind.Null
                ? [p.Name]
                : NullFieldsIn(p.Value).Select(n => $"{p.Name}.{n}")),
        JsonValueKind.Array => element.EnumerateArray().SelectMany(NullFieldsIn),
        _ => [],
    };
}
