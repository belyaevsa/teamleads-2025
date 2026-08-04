using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Tests.Support;

// An IChatSender that records instead of sending.
//
// This is why OutboxTests survives a client swap: the delivery loop is tested against
// the port, so the tests never name TelegramClient, Telebot, or anything else. Whether
// a given adapter honours the port is a separate question, answered by
// ChatSenderContractTests.
public sealed class FakeChatSender : IChatSender
{
    private readonly Queue<Func<ChatMessage, SendOutcome>> _outcomes = new();
    private long _nextMessageId = 1;

    public List<ChatMessage> Sent { get; } = [];
    public ChatMessage Last => Sent.Count > 0 ? Sent[^1] : throw new InvalidOperationException("Nothing was sent.");

    // Queued one per call, so a test can script "first fails, second succeeds" to prove
    // one dead message does not block the rest of a batch.
    public FakeChatSender Delivers(long messageId)
    {
        _outcomes.Enqueue(_ => SendOutcome.Delivered(messageId));
        return this;
    }

    public FakeChatSender Fails(string error)
    {
        _outcomes.Enqueue(_ => SendOutcome.Failed(error));
        return this;
    }

    // An adapter that lets an exception escape rather than translating it to a failed
    // outcome. The port's contract says it should not, and Outbox is not written to
    // survive it – this is here so a test can pin what actually happens when one does.
    public FakeChatSender Throws(Exception ex)
    {
        _outcomes.Enqueue(_ => throw ex);
        return this;
    }

    public Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct)
    {
        Sent.Add(message);

        // Default to success, so a test asserting only on what was sent needs no setup.
        var next = _outcomes.Count > 0 ? _outcomes.Dequeue() : (_ => SendOutcome.Delivered(_nextMessageId++));
        return Task.FromResult(next(message));
    }
}
