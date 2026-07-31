using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Search;

namespace TeamleadsBackend.Endpoints;

public static class PasteEndpoints
{
    private const string BaseUrl = "https://teamleads.kz";
    private const int MaxContentLength = 64 * 1024;   // 64 KB
    private const int MinContentLength = 10;
    private const int AuthorHashLength = 64;

    private static readonly char[] IdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789".ToCharArray();

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public static IEndpointRouteBuilder MapPastes(this IEndpointRouteBuilder api)
    {
        // Relative to the caller's group. Program.cs already maps everything under
        // "/api", so an absolute "/api/pastes" here would land on /api/api/pastes.
        var group = api.MapGroup("/pastes");

        group.MapPost("/", CreateAsync)
            .WithName("CreatePaste")
            .RequireRateLimiting("paste_post")
            .DisableAntiforgery();

        group.MapGet("/{publicId}", GetAsync);

        group.MapGet("/{publicId}/raw", GetRawAsync);

        return api;
    }

    // Called from Program.cs at the root level for clean /p/{id} URLs.
    public static void MapPastePage(WebApplication app)
    {
        app.MapGet("/p/{publicId}", async (
            string publicId,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var paste = await db.Pastes.FirstOrDefaultAsync(p => p.PublicId == publicId, ct);
            return paste is null
                ? Results.NotFound()
                : Results.Content(PastePageHtml(paste), "text/html; charset=utf-8");
        });
    }

    // ── API: create ─────────────────────────────────────────────────────────

    private static async Task<IResult> CreateAsync(
        HttpRequest request,
        AppDbContext db,
        IConfiguration cfg,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        // Every rejection says why. Never logs the paste body – only its size:
        // people put credentials and customer data in pastes.
        var log = loggerFactory.CreateLogger("Paste");

        PasteBody? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<PasteBody>(request.Body, JsonOpts, ct);
        }
        catch (JsonException ex)
        {
            log.LogWarning("Paste rejected: body is not valid JSON ({Message}).", ex.Message);
            return Results.BadRequest(new { error = "invalid_json" });
        }

        var content = (body?.Content ?? "").Trim();
        if (content.Length < MinContentLength)
        {
            log.LogInformation("Paste rejected: {Length} chars, below the {Minimum}-char minimum.", content.Length, MinContentLength);
            return Results.BadRequest(new { error = "too_short", detail = $"Минимум {MinContentLength} символов." });
        }
        if (content.Length > MaxContentLength)
        {
            log.LogInformation("Paste rejected: {Length} chars, over the {Maximum}-char limit.", content.Length, MaxContentLength);
            return Results.BadRequest(new { error = "too_long", detail = $"Максимум {MaxContentLength / 1024} КБ." });
        }

        var source = body?.Source ?? "web";
        var authorName = body?.AuthorName?.Trim().Truncate(120);
        var authorTgId = body?.AuthorTgId;
        var ipHash = authorTgId is not null
            ? null
            : Shared.HashIp(request, cfg);

        // Honeypot: a form field named "website" must stay empty.
        if (!string.IsNullOrWhiteSpace(body?.Website))
        {
            log.LogInformation("Paste dropped: honeypot filled in (source {Source}).", source);
            return Results.Created();
        }

        var language = LanguageDetector.Detect(content);
        var publicId = await GeneratePublicIdAsync(db, ct);

        var paste = new Paste
        {
            PublicId = publicId,
            Content = content,
            Language = language,
            AuthorName = authorName,
            AuthorTgId = authorTgId,
            IpHash = ipHash,
            Source = source,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
        };

        db.Pastes.Add(paste);
        await db.SaveChangesAsync(ct);
        log.LogInformation("Paste {PublicId} created: {Length} chars, language {Language}, source {Source}.",
            publicId, content.Length, language, source);

        return Results.Created($"/p/{publicId}", new
        {
            public_id = publicId,
            url = $"{BaseUrl}/p/{publicId}/",
            raw_url = $"{BaseUrl}/api/pastes/{publicId}/raw",
        });
    }

    // ── API: get ────────────────────────────────────────────────────────────

    private static async Task<IResult> GetAsync(
        string publicId,
        AppDbContext db,
        CancellationToken ct)
    {
        var paste = await db.Pastes.FirstOrDefaultAsync(p => p.PublicId == publicId, ct);
        if (paste is null) return Results.NotFound();

        paste.Views++;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            public_id = paste.PublicId,
            content = paste.Content,
            language = paste.Language,
            source = paste.Source,
            author = paste.AuthorName,
            created_at = paste.CreatedAt,
            expires_at = paste.ExpiresAt,
            views = paste.Views,
            url = $"{BaseUrl}/p/{paste.PublicId}/",
            raw_url = $"{BaseUrl}/api/pastes/{paste.PublicId}/raw",
        });
    }

    // ── API: raw ────────────────────────────────────────────────────────────

    private static async Task<IResult> GetRawAsync(
        string publicId,
        AppDbContext db,
        CancellationToken ct)
    {
        var paste = await db.Pastes.FirstOrDefaultAsync(p => p.PublicId == publicId, ct);
        return paste is null
            ? Results.NotFound()
            : Results.Text(paste.Content, "text/plain; charset=utf-8");
    }

    // ── HTML page ───────────────────────────────────────────────────────────

    private static string PastePageHtml(Paste paste)
    {
        var escaped = WebUtility.HtmlEncode(paste.Content);
        var cssClass = LanguageDetector.HighlightCssClass(paste.Language);
        var firstLine = paste.Content.Split('\n', 2)[0].Trim().Truncate(80);
        var snippet = paste.Content.Truncate(200).Replace('\n', ' ').Replace('\r', ' ');
        var langLabel = LanguageLabel(paste.Language);
        var author = paste.AuthorName is not null ? $" · {WebUtility.HtmlEncode(paste.AuthorName)}" : "";
        var sourceLabel = paste.Source switch
        {
            "bot" => " · из Telegram",
            "shell" => " · из терминала",
            _ => "",
        };

        return $$"""
            <!DOCTYPE html>
            <html lang="ru">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>paste {{paste.PublicId}} – Тимлид не кодит</title>
            <meta property="og:title" content="paste {{paste.PublicId}}: {{WebUtility.HtmlEncode(firstLine)}}">
            <meta property="og:description" content="{{WebUtility.HtmlEncode(snippet)}}">
            <meta property="og:url" content="{{BaseUrl}}/p/{{paste.PublicId}}/">
            <meta property="og:type" content="article">
            <meta property="og:site_name" content="Тимлид не кодит">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" crossorigin="anonymous">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                background: #0d1117;
                color: #c9d1d9;
                font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace;
                font-size: 14px;
                line-height: 1.6;
                min-height: 100vh;
              }
              .paste-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 20px;
                background: #161b22;
                border-bottom: 1px solid #30363d;
                flex-wrap: wrap;
                font-size: 13px;
              }
              .paste-id { color: #58a6ff; font-weight: 600; }
              .paste-meta { color: #8b949e; }
              .paste-lang { background: #30363d; color: #c9d1d9; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
              .paste-actions { margin-left: auto; display: flex; gap: 8px; }
              .paste-btn {
                background: #21262d;
                color: #c9d1d9;
                border: 1px solid #30363d;
                padding: 4px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-family: inherit;
                text-decoration: none;
              }
              .paste-btn:hover { background: #30363d; }
              .paste-body { padding: 20px; }
              .paste-body pre {
                margin: 0;
                padding: 16px;
                background: #161b22;
                border: 1px solid #30363d;
                border-radius: 6px;
                overflow-x: auto;
              }
              .paste-body code { font-family: inherit; font-size: 13px; }
              .paste-footer {
                padding: 8px 20px 20px;
                font-size: 12px;
                color: #484f58;
              }
              .paste-footer a { color: #58a6ff; text-decoration: none; }
              .paste-footer a:hover { text-decoration: underline; }
            </style>
            </head>
            <body>
            <div class="paste-header">
              <span class="paste-id">p/{{paste.PublicId}}</span>
              <span class="paste-lang">{{langLabel}}</span>
              <span class="paste-meta">{{paste.CreatedAt:dd.MM.yyyy HH:mm}}{{author}}{{sourceLabel}}</span>
              <div class="paste-actions">
                <button class="paste-btn" onclick="copyText()">Копировать</button>
                <a class="paste-btn" href="/api/pastes/{{paste.PublicId}}/raw">Raw</a>
                <a class="paste-btn" href="/paste/">+ Новый</a>
              </div>
            </div>
            <div class="paste-body">
              <pre><code class="{{cssClass}}">{{escaped}}</code></pre>
            </div>
            <div class="paste-footer">
              <a href="/">Тимлид не кодит</a> ·
              paste-сервис сообщества ·
              создайте новый на <a href="/paste/">/paste/</a> или через бота <a href="https://t.me/temlead_helper_bot">@temlead_helper_bot</a>
            </div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" crossorigin="anonymous"></script>
            <script>hljs.highlightAll();</script>
            <script>
              function copyText() {
                navigator.clipboard.writeText(document.querySelector('.paste-body code').textContent).then(function () {
                  var b = document.querySelector('.paste-btn');
                  var t = b.textContent;
                  b.textContent = 'Скопировано';
                  setTimeout(function () { b.textContent = t; }, 1500);
                });
              }
            </script>
            </body>
            </html>
            """;
    }

    private static string LanguageLabel(string lang) => lang switch
    {
        "go" => "Go",
        "python" => "Python",
        "javascript" => "JavaScript",
        "rust" => "Rust",
        "json" => "JSON",
        "yaml" => "YAML",
        "sql" => "SQL",
        "bash" => "Bash",
        "plaintext" => "code",
        _ => "text",
    };

    private static async Task<string> GeneratePublicIdAsync(AppDbContext db, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var id = RandomId(7);
            if (!await db.Pastes.AnyAsync(p => p.PublicId == id, ct)) return id;
        }
        return RandomId(12);
    }

    private static string RandomId(int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = IdAlphabet[RandomNumberGenerator.GetInt32(IdAlphabet.Length)];
        return new string(chars);
    }

    private sealed record PasteBody(
        [property: JsonPropertyName("content")] string? Content,
        [property: JsonPropertyName("source")] string? Source,
        [property: JsonPropertyName("author_name")] string? AuthorName,
        [property: JsonPropertyName("author_tg_id")] long? AuthorTgId,
        [property: JsonPropertyName("website")] string? Website);
}

file static class Shared
{
    public const string RateLimitPolicy = "paste_post";

    public static string? HashIp(HttpRequest request, IConfiguration cfg)
    {
        var ip = request.Headers["X-Forwarded-For"].FirstOrDefault()
                 ?? request.HttpContext.Connection.RemoteIpAddress?.ToString()
                 ?? "";
        if (string.IsNullOrWhiteSpace(ip)) return null;

        var salt = cfg["IP_HASH_SALT"];
        if (string.IsNullOrWhiteSpace(salt)) return null;

        var input = Encoding.UTF8.GetBytes($"{ip}|{salt}");
        var hash = SHA256.HashData(input);
        return Convert.ToHexStringLower(hash);
    }
}

file static class StringExtensions
{
    public static string Truncate(this string text, int limit) =>
        text.Length <= limit ? text : string.Concat(text.AsSpan(0, limit - 1), "…");
}
