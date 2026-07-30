namespace TeamleadsBackend.Data;

// A chat message the bot owes someone, stored before it is sent.
//
// Telegram is a remote service that is sometimes down, sometimes rate-limiting, and
// sometimes not configured yet. Sending inline and logging the failure means the
// message is simply lost – that is how anon request ZCBFQR reached the database but
// never reached an admin. Writing the intent to the same transaction as the state
// change, then draining it in the background, turns "delivered" into something the
// system keeps trying to make true.
//
// Only for messages where a late delivery beats no delivery and a duplicate would be
// harmless. Publishing an anonymous question to the community chat is deliberately NOT
// routed through here: a duplicate there is worse than a delay, so it stays an explicit
// admin action guarded by the row's status.
public class OutboxMessage
{
    public int Id { get; set; }
    public string Kind { get; set; } = "";        // anon_card | dilemma_reveal | notice
    // Destination. Either a literal ChatId, or – preferred for anything aimed at a
    // configured chat – the settings key to resolve at SEND time. Freezing the id at
    // enqueue time means a message queued while the id was wrong keeps retrying the
    // wrong chat; resolving late lets a corrected setting rescue the whole backlog.
    public long ChatId { get; set; }
    public string? ChatSetting { get; set; }
    public string Text { get; set; } = "";
    public string? ReplyMarkupJson { get; set; }  // inline keyboard, serialized as sent

    // What this message is about, so a successful send can write back to the source row
    // (e.g. storing the moderation card's message id on the AnonRequest).
    public string? RelatedKind { get; set; }
    public string? RelatedKey { get; set; }

    public string Status { get; set; } = "pending";   // pending | sent | failed | expired
    public int Attempts { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }    // null = never stale
    public string? LastError { get; set; }
}
