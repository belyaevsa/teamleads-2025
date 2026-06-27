namespace TeamleadsBackend.Security;

// Minimal admin gate for moderation endpoints: the request must carry
// `X-Api-Key` matching the ADMIN_API_KEY env var. Good enough for v1; swap for
// real auth later. If no key is configured the gate fails closed (401), so a
// misconfigured deploy never exposes the moderation lists.
public sealed class ApiKeyFilter(IConfiguration config) : IEndpointFilter
{
    public const string HeaderName = "X-Api-Key";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var expected = config["ADMIN_API_KEY"];
        var provided = ctx.HttpContext.Request.Headers[HeaderName].ToString();

        if (string.IsNullOrEmpty(expected) || !FixedTimeEquals(provided, expected))
            return Results.Unauthorized();

        return await next(ctx);
    }

    // Constant-time compare so the gate doesn't leak the key length/prefix via timing.
    private static bool FixedTimeEquals(string a, string b)
    {
        var ba = System.Text.Encoding.UTF8.GetBytes(a);
        var bb = System.Text.Encoding.UTF8.GetBytes(b);
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(ba, bb);
    }
}

public static class ApiKeyExtensions
{
    public static TBuilder RequireApiKey<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter<TBuilder, ApiKeyFilter>();
        return builder;
    }
}
