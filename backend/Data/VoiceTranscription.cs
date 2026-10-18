namespace TeamleadsBackend.Data;

// One voice message on its way to becoming a paste.
//
// A job row rather than work done inside the webhook: transcribing fifteen minutes of
// speech and restructuring it takes up to a minute, and Telegram gives the webhook a few
// seconds before it redelivers the update. So the webhook writes this row, answers
// "расшифровываю", and VoiceTranscriptionWorker does the rest. The row also outlives a
// container swap mid-job – a restart picks the job back up instead of leaving the chat
// waiting on a promise nobody remembers making.
//
// FileUniqueId is the dedupe key, and it is Telegram's, not ours: the same voice message
// keeps its file_unique_id when forwarded to another chat or to the bot's DM, so "this
// one was already transcribed" holds across chats, not only within the one it was sent
// to. Ten people replying /paste to the same voice cost one transcription.
public class VoiceTranscription
{
    public int Id { get; set; }
    public string FileUniqueId { get; set; } = "";
    public string FileId { get; set; } = "";        // what getFile takes; may change, so not the key
    public int DurationSeconds { get; set; }

    // Where the request came from and where the answer goes. StatusMessageId is the bot's
    // own "расшифровываю" reply, which the worker edits into the link; 0 if that reply
    // never landed, in which case the worker sends a fresh one instead.
    public long ChatId { get; set; }
    public long VoiceMessageId { get; set; }
    public long StatusMessageId { get; set; }

    // The paste is attributed to whoever SPOKE, not whoever typed /paste – the same rule
    // as /paste on a wall of text. Stored for the same reason a bot paste stores it: it
    // was a deliberate share, and the name is shown next to the content.
    public string AuthorName { get; set; } = "";
    public long? AuthorTgId { get; set; }

    public string Status { get; set; } = "pending";   // pending | running | done | failed
    public int Attempts { get; set; }
    public string? PastePublicId { get; set; }
    public string? LastError { get; set; }
    public decimal? CostUsd { get; set; }               // OpenRouter's own usage.cost, both calls
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
