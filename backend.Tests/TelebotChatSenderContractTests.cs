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

    // null, not false: the request type has no preview field, so the adapter cannot even
    // express the intent. The contract test asserts true and therefore fails – which is
    // the correct outcome, and the whole reason DisablePreview is on the port.
    protected override bool? SentDisablePreview(TestHost host) => null;

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
