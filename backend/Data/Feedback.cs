namespace TeamleadsBackend.Data;

// A free-form message left from the site (shell `feedback`, a contact form, …).
// `IpHash` is a salted hash, never the raw address – enough to spot abuse, no PII stored.
public class Feedback
{
    public int Id { get; set; }
    public string Message { get; set; } = "";
    public string? Page { get; set; }       // where it was sent from (path/url)
    public string? Contact { get; set; }     // optional way to reach the author back
    public string? IpHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool Handled { get; set; }        // moderation flag
}
