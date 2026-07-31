using System.Diagnostics;

namespace TeamleadsBackend.Security;

// Access log for failures only.
//
// This replaces ASP.NET's HttpLogging, which cannot express "log nothing on success":
// its interceptor sees the status code only after the request fields have already been
// collected, so clearing them there still emits a half-line. One 200 per request buried
// the lines that carry meaning – Telegram delivers an update per message in the
// community chat and the bot is an admin there, so it sees all of them.
//
// Failures still log, and that matters: a 404 on an unmapped route produces no
// application log at all, which is exactly how POST /api/pastes stayed silently dead.
//
// The webhook is authenticated by an unguessable path segment, so the path IS a
// credential (/api/tg/webhook/<TG_WEBHOOK_SECRET>). It is redacted before writing –
// paired with scopes being off in production, where the hosting layer would otherwise
// print RequestPath on every line the request produces.
public sealed class AccessLog(RequestDelegate next, ILogger<AccessLog> log)
{
    private const string WebhookPrefix = "/api/tg/webhook/";

    public async Task InvokeAsync(HttpContext ctx)
    {
        var startedAt = Stopwatch.GetTimestamp();
        await next(ctx);

        var status = ctx.Response.StatusCode;
        if (status < 400) return;

        var elapsed = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
        var path = Redact(ctx.Request.Path.Value ?? "");

        // 5xx is ours to fix; 4xx is usually the caller's, or a probe.
        if (status >= 500)
            log.LogError("{Method} {Path} -> {Status} in {Elapsed:F0} ms.", ctx.Request.Method, path, status, elapsed);
        else
            log.LogInformation("{Method} {Path} -> {Status} in {Elapsed:F0} ms.", ctx.Request.Method, path, status, elapsed);
    }

    private static string Redact(string path) =>
        path.StartsWith(WebhookPrefix, StringComparison.Ordinal) ? WebhookPrefix + "***" : path;
}
