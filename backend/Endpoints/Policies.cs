namespace TeamleadsBackend.Endpoints;

public static class Policies
{
    // Rate-limiter policy guarding unauthenticated public POSTs (feedback, submissions).
    public const string PublicPost = "public-post";

    // Stricter limiter for anonymous questions: every accepted one costs an admin
    // a moderation decision, so the ceiling is per hour rather than per minute.
    public const string AnonPost = "anon-post";

    // Simulator answers: a run is six picks in a minute or two, so the public-post
    // ceiling of 5/min would drop real answers. Still per IP, still bounded.
    public const string SimPost = "sim-post";
}
