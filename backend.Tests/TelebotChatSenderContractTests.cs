using System.Text.Json;
using Telebot;
using Telebot.Models;
using TeamleadsBackend.Telegram;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// The Telebot adapter measured against the same contract as the current one.
//
// Telebot's transport uses a private static HttpClient hardcoded to api.telegram.org,
// so there is no socket to intercept – the observation point is the request object
// handed to ITelegramClient instead. That is enough: the contract asks what the adapter
// asked for, not how it was framed.
public sealed class TelebotChatSenderContractTests : ChatSenderContractTests
{
    // One fake per TestHost, keyed so the abstract hooks can reach the same instance.
    private static readonly Dictionary<TestHost, FakeTelegramClient> Clients = [];

    private static FakeTelegramClient For(TestHost host) =>
        Clients.TryGetValue(host, out var c) ? c : Clients[host] = new FakeTelegramClient();

    protected override IChatSender CreateSender(TestHost host) => new TelebotChatSender(For(host));

    protected override void GivenDelivers(TestHost host, long messageId) =>
        For(host).Delivers((int)messageId);

    // Telebot reports an API refusal as a TelebotException carrying the description.
    protected override void GivenApiError(TestHost host, string description) =>
        For(host).Throws(new TelebotException(400, description));

    protected override void GivenTransportFailure(TestHost host, Exception ex) =>
        For(host).Throws(ex);

    protected override JsonElement? SentReplyMarkup(TestHost host)
    {
        var markup = For(host).Last.ReplyMarkup;
        return markup is null ? null : JsonDocument.Parse(markup.ToJson()).RootElement;
    }

    // Bot API 7.0 replaced disable_web_page_preview with a link_preview_options object;
    // Telebot exposes it as SendMessageRequestParams.LinkPreviewOptions.IsDisabled. The
    // adapter can now express the intent, so the observation reads that field directly –
    // null when the adapter sent no options, true/false when it did.
    protected override bool? SentDisablePreview(TestHost host) =>
        For(host).Last.LinkPreviewOptions?.IsDisabled;

    // Telebot-specific, and paid for in production.
    //
    // 0.0.6 serializes request models with nulls included, so the four members of
    // LinkPreviewOptions the adapter left unset went out as
    // `{"is_disabled":true,"url":null,…}` and Telegram refused the entire call:
    // `Bad Request: field "url" must be of type String`. The message that hit it was an
    // anon moderation card, which then burned its way down the backoff ladder and died.
    //
    // Asserted against GetRequestFields() – the payload Telebot itself builds – rather
    // than against the LinkPreviewOptions object. The object being fully populated is the
    // means; bytes with no nulls in them is the end, and only the bytes are what Telegram
    // parses. Filling `url` alone would pass a member check and still fail on the wire:
    // Telegram simply moves on to complaining about `prefer_small_media`.
    [Fact]
    public async Task Link_preview_options_reach_the_wire_with_no_nulls_in_them()
    {
        using var host = new TestHost();

        await CreateSender(host).SendMessageAsync(
            new ChatMessage(-100500, "hi", null, DisablePreview: true), CancellationToken.None);

        var options = SentField(host, "link_preview_options");
        Assert.NotNull(options);
        Assert.True(options.Value.GetProperty("is_disabled").GetBoolean());
        Assert.Empty(NullFieldsIn(options.Value));
    }

    // The same defect one field over. Every request object Telebot serializes has this
    // property, so a later addition here – reply_parameters, an entity list – reintroduces
    // the outage rather than inheriting the fix. Sweeping the whole payload is what keeps
    // the rule "the adapter emits no nulls" instead of "someone remembered this one time".
    [Fact]
    public async Task No_field_of_the_request_reaches_the_wire_holding_a_null()
    {
        using var host = new TestHost();
        const string keyboard = """
            {"inline_keyboard":[[{"text":"Опубликовать","callback_data":"anon:pub:A7F3K2"}]]}
            """;

        await CreateSender(host).SendMessageAsync(
            new ChatMessage(-100500, "hi", keyboard, DisablePreview: true), CancellationToken.None);

        var offenders = For(host).Last.GetRequestFields()
            .SelectMany(f => AsJson(f.Value) is { } json
                ? NullFieldsIn(json).Select(n => $"{f.Name}.{n}")
                : [])
            .ToArray();

        Assert.Empty(offenders);
    }

    // Telebot renders each field's value as a string; only the composite ones are JSON.
    private static JsonElement? AsJson(string? value)
    {
        if (value is null || !value.StartsWith('{')) return null;
        return JsonDocument.Parse(value).RootElement;
    }

    private static JsonElement? SentField(TestHost host, string name) =>
        For(host).Last.GetRequestFields().FirstOrDefault(f => f.Name == name) is { } field
            ? AsJson(field.Value)
            : null;

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

    private sealed class FakeTelegramClient : ITelegramClient
    {
        private readonly Queue<Func<SendMessageRequestParams, Message>> _outcomes = new();

        public SendMessageRequestParams Last { get; private set; } = null!;

        public void Delivers(int messageId) => _outcomes.Enqueue(p => Sent(messageId, p));

        public void Throws(Exception ex) => _outcomes.Enqueue(_ => throw ex);

        private static Message Sent(int id, SendMessageRequestParams p) =>
            new(id, null, null, null, null, null, 0, null,
                new Chat(p.ChatId, "supergroup", null, null, null, null, null, null),
                null, null, null, null, null, p.Text, null);

        public Task<Message> SendMessageAsync(SendMessageRequestParams requestParams, CancellationToken ct)
        {
            Last = requestParams;
            Func<SendMessageRequestParams, Message> next =
                _outcomes.Count > 0 ? _outcomes.Dequeue() : p => Sent(1, p);
            return Task.FromResult(next(requestParams));
        }

        // Not exercised by the contract – the port covers sendMessage only.
        public Task<User> GetMeAsync(GetMeRequestParams p, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<Update>> GetUpdatesAsync(GetUpdatesRequestParams p, CancellationToken ct) => throw new NotSupportedException();
        public Task<Message> SendPhotoAsync(SendPhotoRequestParams p, CancellationToken ct) => throw new NotSupportedException();
        public Task<bool> SetWebhookAsync(SetWebhookRequestParams p, CancellationToken ct) => throw new NotSupportedException();
        public Task<Message> SendPollAsync(SendPollRequestParams p, CancellationToken ct) => throw new NotSupportedException();
    }
}
