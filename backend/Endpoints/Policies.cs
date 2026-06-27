namespace TeamleadsBackend.Endpoints;

public static class Policies
{
    // Rate-limiter policy guarding unauthenticated public POSTs (feedback, submissions).
    public const string PublicPost = "public-post";
}
