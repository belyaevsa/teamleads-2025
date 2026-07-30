namespace TeamleadsBackend.Data;

// One thing the bot posted to the community chat on its own initiative.
//
// Three jobs:
//  · idempotency – a restart mid-schedule must not double-post;
//  · rotation – "which dilemma have we not used yet" is answered from here;
//  · follow-up – the outcomes message a day later needs to know what was asked, so
//    `Payload` carries a snapshot of the texts. Deliberately a snapshot and not a
//    re-fetch: the feed is regenerated on every content deploy, and a scenario that
//    was edited (or removed) in between must not silently change what the chat voted on.
public class BotPost
{
    public int Id { get; set; }
    public string Kind { get; set; } = "";        // dilemma | agenda | quiz | insight
    public string Key { get; set; } = "";         // scenario/quiz id – unique per kind for rotation
    public long ChatId { get; set; }
    public long MessageId { get; set; }
    public DateTimeOffset PostedAt { get; set; }
    public DateTimeOffset? FollowedUpAt { get; set; }   // null => follow-up still owed
    public string? Payload { get; set; }                // JSON snapshot of what was posted
}
