namespace TeamleadsBackend.Data;

// A text or code snippet shared via a short URL.
//
// Two audiences, one table:
//  · Pasted from Telegram DM or the community chat -> author name and id are
//    stored (it was a deliberate share, not an anonymous question).
//  · Pasted from the web form or the shell -> IpHash only, no identity.
public class Paste
{
    public int Id { get; set; }
    public string PublicId { get; set; } = "";         // e.g. "A7F3K2"
    public string Content { get; set; } = "";           // the paste body (up to ~64 KB)
    public string Language { get; set; } = "text";      // detected language or "text"
    public string? AuthorName { get; set; }             // Telegram first name (non-null only from bot)
    public long? AuthorTgId { get; set; }               // Telegram user id (non-null only from bot)
    public string? IpHash { get; set; }                 // salted IP hash (non-null only from web/shell)
    public string Source { get; set; } = "";            // "bot" | "web" | "shell"
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }      // null = never expires
    public int Views { get; set; }
}
