namespace TeamleadsBackend.Data;

// A community submission awaiting moderation (e.g. a showcase project, a tool).
// `Type` lets one table back several site flows; `Status` drives the moderation queue.
public class Submission
{
    public int Id { get; set; }
    public string Type { get; set; } = "showcase";   // showcase | tool | …
    public string Title { get; set; } = "";
    public string? Url { get; set; }
    public string? Author { get; set; }
    public string? Notes { get; set; }
    public string? IpHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string Status { get; set; } = "pending";  // pending | approved | rejected
}
