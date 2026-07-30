namespace TeamleadsBackend.Data;

// An anonymous question awaiting moderation, on its way to the community chat.
//
// Anonymity invariant: this row never holds a raw telegram id, username or IP.
// `AuthorHash` is a salted, non-reversible hash used only for rate limiting and
// for spotting a flooder – with IP_HASH_SALT unset it stays null (same rule as
// Feedback.IpHash). Admins see the text and nothing else.
public class AnonRequest
{
    public int Id { get; set; }
    public string PublicId { get; set; } = "";        // short token shown to the author, e.g. "A7F3K2"
    public string Text { get; set; } = "";            // as submitted
    public string? EditedText { get; set; }           // admin's version; published instead of Text when set
    public string Source { get; set; } = "";          // form | bot | shell
    public string Status { get; set; } = "pending";   // pending | published | rejected

    public string? AuthorHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public long? AdminMessageId { get; set; }         // moderation card, edited in place after a decision
    public DateTimeOffset? ModeratedAt { get; set; }
    public long? ModeratedByTgId { get; set; }        // admins are not anonymous – we log who decided
    public long? PublishedMessageId { get; set; }     // message in the community chat
    public string? RejectReason { get; set; }

    // What actually goes to the chat.
    public string PublishText => string.IsNullOrWhiteSpace(EditedText) ? Text : EditedText;
}
