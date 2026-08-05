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
// Deliberately narrow. It covers sendMessage and nothing else, because that is all the
// outbox does. Polls, edits, callback answers and inline results still go through
// TelegramClient directly from the services that use them; widen this port one method
// at a time as those migrate, rather than mirroring the Bot API up front.
public interface IChatSender
{
    Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct);
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
public sealed record ChatMessage(
    long ChatId,
    string Text,
    string? ReplyMarkupJson = null,
    bool DisablePreview = true);

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
