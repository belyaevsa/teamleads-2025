namespace TeamleadsBackend.Endpoints;

public static class Policies
{
    // Rate-limiter policy guarding unauthenticated public POSTs (feedback, submissions).
    public const string PublicPost = "public-post";

    // Stricter limiter for anonymous questions: every accepted one costs an admin
    // a moderation decision, so the ceiling is per hour rather than per minute.
    public const string AnonPost = "anon-post";
}
