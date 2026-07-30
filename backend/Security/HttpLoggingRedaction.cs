using Microsoft.AspNetCore.HttpLogging;

namespace TeamleadsBackend.Security;

// Keeps the Telegram webhook secret out of the access log.
//
// The webhook is authenticated by an unguessable path segment plus a header, so the
// request path IS a credential: /api/tg/webhook/<TG_WEBHOOK_SECRET>. HttpLogging prints
// the path on every request, which puts that secret into `docker logs`, into anything
// shipping those logs elsewhere, and into any screenshot of them.
//
// This replaces the segment with *** before the line is written. Paired with scopes
// being off in production (see Program.cs), where the hosting layer would otherwise
// print RequestPath on every line the request produces.
public sealed class HttpLoggingRedaction : IHttpLoggingInterceptor
{
    private const string WebhookPrefix = "/api/tg/webhook/";

    public ValueTask OnRequestAsync(HttpLoggingInterceptorContext context)
    {
        var path = context.HttpContext.Request.Path.Value ?? "";
        if (path.StartsWith(WebhookPrefix, StringComparison.Ordinal))
        {
            context.Disable(HttpLoggingFields.RequestPath);
            context.AddParameter("Path", WebhookPrefix + "***");
        }
        return default;
    }

    public ValueTask OnResponseAsync(HttpLoggingInterceptorContext context) => default;
}
