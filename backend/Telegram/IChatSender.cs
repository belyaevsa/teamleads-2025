namespace TeamleadsBackend.Telegram;

// The one thing the outbox needs from Telegram: put this text in that chat, tell me
// whether it landed and what message id it got.
//
// This exists so the delivery loop does not name a Bot API library. Which client is
// underneath – the hand-rolled TelegramClient, a package, something else later – is an
// adapter concern, and swapping it must not touch Outbox or its tests. Before this port
// existed, a PR replacing the client broke the test project's compile, because the
// vendor type WAS the seam.
//
// Four methods, not the Bot API. Each one is here because a feature moved onto it:
// sendMessage for the outbox, editMessageText for the moderation card, sendPoll for the
// weekly dilemma, answerCallbackQuery for the spinner on an admin's button.
//
// Two calls are deliberately NOT here, and still go through TelegramClient directly:
//
//   stopPoll             – the dilemma reveal's vote tally.
//   answerInlineQuery    – archive search from the inline strip.
//
// Bucketlab.Telebot 0.0.72 implements neither, so putting them on the port would only buy
// an adapter that throws. They move the day the package grows them; nothing above the port
// has to change when they do. A threaded reply was a third exception under 0.0.7 – the
// package could only express it through an object it filled with nulls – and stopped being
// one in 0.0.72, which is what ReplyToMessageId below is doing back on the port.
public interface IChatSender
{
    Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct);

    Task<SendOutcome> EditMessageTextAsync(ChatEdit edit, CancellationToken ct);

    Task<SendOutcome> SendPollAsync(ChatPoll poll, CancellationToken ct);

    Task<SendOutcome> AnswerCallbackAsync(CallbackAnswer answer, CancellationToken ct);
}

// What to send, in our vocabulary rather than any library's.
//
// ReplyMarkupJson stays a JSON string on purpose. The outbox serializes the keyboard at
// enqueue time and stores it in a column, so JSON is already the wire format between
// "decided to send" and "sent"; handing the adapter that string lets each one
// deserialize into whatever shape its client wants, and keeps a vendor keyboard type
// out of both the queue and the port.
//
// DisablePreview is explicit, not assumed. A moderation card is mostly links, and with
// previews on it renders as a wall of cards instead of one message. Any adapter that
// cannot honour this is changing behaviour, and the contract test says so out loud.
//
// ReplyToMessageId threads the answer under the message it is about – /paste in the
// community chat puts the link under the wall of text it replaces, and the bot's "I can't
// read that file" answer names the file it means. An adapter must also allow the reply
// target to be missing: the original may already be deleted, and a lost reply target must
// never turn into a lost answer.
public sealed record ChatMessage(
    long ChatId,
    string Text,
    string? ReplyMarkupJson = null,
    bool DisablePreview = true,
    long? ReplyToMessageId = null);

// Rewriting a message already in a chat. This is how the moderation card settles: the
// buttons come off and the card says what was decided, in place, rather than the admin
// chat filling with a running commentary.
//
// A null keyboard means "no buttons", not "leave the buttons alone" – a decided card
// must not offer a second tap.
public sealed record ChatEdit(
    long ChatId,
    long MessageId,
    string Text,
    string? ReplyMarkupJson = null);

// An anonymous, non-quiz poll: the only kind this bot posts.
//
// No correct answer, by construction rather than by convention – a dilemma has none, and
// a client that turned this into a quiz would have Telegram announce a winner the
// scenario never picked. Anonymity is the reason the format works at all: a vote costs
// nothing and names nobody, so people who never type in a chat full of their colleagues
// still take part.
public sealed record ChatPoll(
    long ChatId,
    string Question,
    IReadOnlyList<string> Options);

// The answer to a tapped inline button. Fire-and-forget by nature: by the time this goes
// out the decision is already recorded, and all it does is stop the spinner. Text is
// optional – some taps have nothing to say beyond "heard you".
public sealed record CallbackAnswer(
    string CallbackQueryId,
    string? Text = null);

// A delivery attempt's outcome. A result rather than an exception, because a Telegram
// outage, a rate limit or a bot kicked from the chat are all expected conditions here –
// the outbox turns them into a retry, not a 500. Adapters wrapping a client that throws
// are responsible for translating; see BotApiChatSender.
public readonly record struct SendOutcome(bool Ok, long MessageId, string? Error, long? MigrateToChatId = null)
{
    public static SendOutcome Delivered(long messageId) => new(true, messageId, null);

    // Error is non-null by construction: a failure with no reason is undebuggable, and
    // this string is what lands in OutboxMessage.LastError.
    public static SendOutcome Failed(string error) => new(false, 0, error);

    // A failure that carries its own fix: the chat still exists, it just has a new id.
    //
    // Telegram assigns a new id when a group is upgraded to a supergroup, and answers
    // every send to the old one with `parameters.migrate_to_chat_id`. Retrying the old id
    // can only fail again, so an adapter that flattens this into a plain Failed burns the
    // whole backoff ladder and loses the message – which is exactly what happened to
    // outbox 6 (an anon moderation card) the day the admin group was upgraded.
    //
    // Modelled as its own outcome rather than a magic string in Error: the delivery loop
    // has to ACT on it (repoint the destination, retry now), and parsing English out of
    // an error message to decide that is not a contract.
    public static SendOutcome Migrated(long newChatId, string error) => new(false, 0, error, newChatId);
}
