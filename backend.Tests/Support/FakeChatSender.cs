using System.Text.Json;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Tests.Support;

// An IChatSender that records instead of sending.
//
// This is why OutboxTests survives a client swap: the delivery loop is tested against
// the port, so the tests never name TelegramClient, Telebot, or anything else. The same
// now goes for the services – AnonService, DilemmaService, QuestionService and the
// webhook all hold the port, and their tests assert on what was asked for rather than on
// the bytes one particular package would have produced.
//
// Whether a given adapter honours the port is a separate question, answered by
// ChatSenderContractTests.
public sealed class FakeChatSender : IChatSender
{
    private readonly Queue<Func<ChatMessage, SendOutcome>> _outcomes = new();
    private long _nextMessageId = 1;

    public List<ChatMessage> Sent { get; } = [];
    public ChatMessage Last => Sent.Count > 0 ? Sent[^1] : throw new InvalidOperationException("Nothing was sent.");

    // Every call through the port, in order, whatever its kind. "Which calls, in which
    // order, and which ones never happened" is most of what a call site owes Telegram,
    // and none of it is visible in a per-method list.
    public List<PortCall> Calls { get; } = [];

    public PortCall LastCall => Calls.Count > 0 ? Calls[^1] : throw new InvalidOperationException("Nothing was called.");

    public IEnumerable<string> Methods => Calls.Select(c => c.Method);

    public sealed record PortCall(
        string Method,
        long ChatId = 0,
        string? Text = null,
        string? ReplyMarkupJson = null,
        bool? DisablePreview = null,
        long? ReplyToMessageId = null,
        long? MessageId = null,
        IReadOnlyList<string>? Options = null,
        string? CallbackQueryId = null)
    {
        // The keyboard as JSON, for the assertions that care which buttons a card carries.
        // Null when none was sent – which is itself the assertion on a settled card.
        public JsonElement? Markup =>
            ReplyMarkupJson is null ? null : JsonDocument.Parse(ReplyMarkupJson).RootElement;

        public JsonElement Button(int index) =>
            Markup!.Value.GetProperty("inline_keyboard")[0][index];
    }

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

    // The chat was upgraded to a supergroup: a refusal that names the chat's new id.
    public FakeChatSender Migrates(long newChatId)
    {
        _outcomes.Enqueue(_ => SendOutcome.Migrated(newChatId,
            "Bad Request: group chat was upgraded to a supergroup chat"));
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

    // Poll stops script their own queue: the outcome they produce is a different type, so
    // a test closing a poll cannot accidentally feed the sends' queue and vice versa.
    // Defaults to "closed, nobody voted", which is the reveal with no chat percentages.
    private readonly Queue<PollOutcome> _stops = [];

    public FakeChatSender StopsPoll(params int[] voterCounts)
    {
        _stops.Enqueue(PollOutcome.Closed(voterCounts));
        return this;
    }

    public FakeChatSender FailsToStopPoll(string error)
    {
        _stops.Enqueue(PollOutcome.Failed(error));
        return this;
    }

    public Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct)
    {
        Sent.Add(message);
        Calls.Add(new PortCall("sendMessage", message.ChatId, message.Text, message.ReplyMarkupJson,
            message.DisablePreview, message.ReplyToMessageId));
        return Task.FromResult(Next(message));
    }

    public Task<SendOutcome> EditMessageTextAsync(ChatEdit edit, CancellationToken ct)
    {
        Calls.Add(new PortCall("editMessageText", edit.ChatId, edit.Text, edit.ReplyMarkupJson,
            MessageId: edit.MessageId));
        return Task.FromResult(Next(new ChatMessage(edit.ChatId, edit.Text)));
    }

    public Task<SendOutcome> SendPollAsync(ChatPoll poll, CancellationToken ct)
    {
        Calls.Add(new PortCall("sendPoll", poll.ChatId, poll.Question, Options: poll.Options));
        return Task.FromResult(Next(new ChatMessage(poll.ChatId, poll.Question)));
    }

    public Task<SendOutcome> AnswerCallbackAsync(CallbackAnswer answer, CancellationToken ct)
    {
        Calls.Add(new PortCall("answerCallback", Text: answer.Text, CallbackQueryId: answer.CallbackQueryId));
        return Task.FromResult(Next(new ChatMessage(0, answer.Text ?? "")));
    }

    public Task<PollOutcome> StopPollAsync(ChatPollStop stop, CancellationToken ct)
    {
        Calls.Add(new PortCall("stopPoll", stop.ChatId, MessageId: stop.MessageId));
        return Task.FromResult(_stops.Count > 0 ? _stops.Dequeue() : PollOutcome.Closed([]));
    }

    // Default to success, so a test asserting only on what was sent needs no setup. The
    // queue is shared across all four methods on purpose: a test scripting "the publish
    // fails" should not have to know how many card edits follow it.
    private SendOutcome Next(ChatMessage message)
    {
        var next = _outcomes.Count > 0 ? _outcomes.Dequeue() : (_ => SendOutcome.Delivered(_nextMessageId++));
        return next(message);
    }
}
