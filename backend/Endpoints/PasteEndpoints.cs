using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Content;
using TeamleadsBackend.Data;
using TeamleadsBackend.Search;
using TeamleadsBackend.Security;

namespace TeamleadsBackend.Endpoints;

public static class PasteEndpoints
{
    private const string BaseUrl = "https://teamleads.kz";
    private const int MaxContentLength = 64 * 1024;   // 64 KB
    private const int MinContentLength = 10;

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
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var log = loggerFactory.CreateLogger("Paste");
            var paste = await db.Pastes.FirstOrDefaultAsync(p => p.PublicId == publicId, ct);
            if (paste is null)
            {
                log.LogInformation("Paste {PublicId} requested but not found (expired, or a bad link).", publicId);
                return Results.NotFound();
            }

            // The HTML page is how pastes are actually read – the JSON endpoint is not.
            // Counting only the latter made Views a number about nothing.
            paste.Views++;
            await db.SaveChangesAsync(ct);

            log.LogInformation("Paste {PublicId} viewed ({Views} total, language {Language}, source {Source}).",
                paste.PublicId, paste.Views, paste.Language, paste.Source);

            return Results.Content(PastePageHtml(paste), "text/html; charset=utf-8");
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

        // Everything below is derived, never accepted. A public endpoint that takes an
        // author on trust publishes a paste on this domain under a name its owner never
        // typed; and the old `author_tg_id` field also switched the ip_hash off, so
        // supplying one field opted the sender out of the only abuse trail there is.
        // The bot path sets both from the Telegram update, where they are attested –
        // see TelegramWebhookEndpoints.HandlePasteWebhookAsync.
        var source = NormalizeSource(body?.Source);
        var ipHash = ClientFingerprint.IpHash(request.HttpContext, cfg);

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
            AuthorName = null,          // anonymous by construction on this path
            AuthorTgId = null,
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
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var paste = await db.Pastes.FirstOrDefaultAsync(p => p.PublicId == publicId, ct);
        loggerFactory.CreateLogger("Paste").LogInformation(
            "Paste {PublicId} raw fetch: {Result}.", publicId, paste is null ? "not found" : "served");

        return paste is null
            ? Results.NotFound()
            : Results.Text(paste.Content, "text/plain; charset=utf-8");
    }

    // ── HTML page ───────────────────────────────────────────────────────────

    private static string PastePageHtml(Paste paste)
    {
        var escaped = WebUtility.HtmlEncode(paste.Content);
        // Language is stored at creation, but markdown became a language later than some
        // of the pastes still on the site: everything the old detector could not place
        // landed on "text"/"plaintext". Re-running detection for exactly those two lets a
        // link someone shared three weeks ago render as the document it always was, and
        // leaves every confidently-detected language alone.
        var language = paste.Language is "text" or "plaintext"
            ? LanguageDetector.Detect(paste.Content)
            : paste.Language;
        var cssClass = LanguageDetector.HighlightCssClass(language);
        var isMarkdown = language == "markdown";
        var firstLine = paste.Content.Split('\n', 2)[0].Trim().Truncate(80);
        var snippet = paste.Content.Truncate(200).Replace('\n', ' ').Replace('\r', ' ');
        var langLabel = LanguageLabel(language);
        // Wrapped in a tagged span so the Instant View template can select the author
        // on its own; the surrounding text stays exactly as before.
        var author = paste.AuthorName is not null
            ? $""" · <span data-author>{WebUtility.HtmlEncode(paste.AuthorName)}</span>"""
            : "";
        var sourceLabel = paste.Source switch
        {
            "bot" => " · из Telegram",
            "shell" => " · из терминала",
            _ => "",
        };

        // A markdown paste is a document, so it renders as one. The source stays on the
        // page behind a toggle: half the reason to paste markdown is to hand someone the
        // text to copy, not just to look at it. Everything else is code and keeps the
        // plain <pre>, where a wrap toggle is what matters instead.
        var contentHtml = isMarkdown
            ? $"""
              <div class="paste-md" data-md>{PasteMarkdown.ToHtml(paste.Content)}</div>
                  <pre class="paste-source" data-source hidden><code class="language-markdown" data-raw>{escaped}</code></pre>
              """
            : $"""<pre><code class="{cssClass}" data-raw>{escaped}</code></pre>""";

        var viewToggle = isMarkdown
            ? """<button class="paste-btn" onclick="toggleSource()" aria-pressed="false" data-source-btn>Исходник</button>"""
            : """<button class="paste-btn" onclick="toggleWrap()" aria-pressed="false" data-wrap>Перенос строк</button>""";

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
            <meta property="article:published_time" content="{{paste.CreatedAt:yyyy-MM-ddTHH:mm:sszzz}}">
            <meta property="og:site_name" content="Тимлид не кодит">
            <meta name="color-scheme" content="light dark">
            <script>
              // Runs before the first paint: a saved dark choice must not arrive as a
              // flash of white. Everything else about the theme is plain CSS.
              (function () {
                try {
                  var t = localStorage.getItem('paste-theme');
                  if (t) document.documentElement.setAttribute('data-theme', t);
                } catch (e) {}
              })();
            </script>
            <style>
              /* Light is the default, and dark is the opt-in – the other way round is
                 what the page used to do, and reading a wide code block as pale text on
                 black is what people said made their eyes swim. The OS preference still
                 wins over the default; the button in the header wins over both. */
              :root {
                --bg: #ffffff;
                --panel: #f6f8fa;
                --border: #d0d7de;
                --fg: #1f2328;
                --muted: #59636e;
                --accent: #0969da;
                --btn-bg: #f6f8fa;
                --btn-hover: #eaeef2;
                --hl-keyword: #cf222e;
                --hl-string: #0a3069;
                --hl-comment: #6e7781;
                --hl-number: #0550ae;
                --hl-title: #6639ba;
                --hl-type: #953800;
                --hl-tag: #116329;
              }
              @media (prefers-color-scheme: dark) {
                :root:not([data-theme="light"]) {
                  --bg: #0d1117;
                  --panel: #161b22;
                  --border: #30363d;
                  --fg: #c9d1d9;
                  --muted: #8b949e;
                  --accent: #58a6ff;
                  --btn-bg: #21262d;
                  --btn-hover: #30363d;
                  --hl-keyword: #ff7b72;
                  --hl-string: #a5d6ff;
                  --hl-comment: #8b949e;
                  --hl-number: #79c0ff;
                  --hl-title: #d2a8ff;
                  --hl-type: #ffa657;
                  --hl-tag: #7ee787;
                }
              }
              :root[data-theme="dark"] {
                --bg: #0d1117;
                --panel: #161b22;
                --border: #30363d;
                --fg: #c9d1d9;
                --muted: #8b949e;
                --accent: #58a6ff;
                --btn-bg: #21262d;
                --btn-hover: #30363d;
                --hl-keyword: #ff7b72;
                --hl-string: #a5d6ff;
                --hl-comment: #8b949e;
                --hl-number: #79c0ff;
                --hl-title: #d2a8ff;
                --hl-type: #ffa657;
                --hl-tag: #7ee787;
              }

              /* One centred column on a wide screen. The bars keep their full-width
                 background – only their contents are pulled in – so the page still
                 reads as a page and not as a card floating in an empty desktop. */
              :root { --measure: 1160px; }

              * { box-sizing: border-box; margin: 0; padding: 0; }
              [hidden] { display: none !important; }
              body {
                background: var(--bg);
                color: var(--fg);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                font-size: 15px;
                line-height: 1.6;
                min-height: 100vh;
                overflow-x: hidden;
                -webkit-text-size-adjust: 100%;
              }
              pre, code, .paste-id, kbd { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace; }

              .paste-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px max(20px, (100% - var(--measure)) / 2);
                background: var(--panel);
                border-bottom: 1px solid var(--border);
                flex-wrap: wrap;
                font-size: 13px;
              }
              /* h1 and address are here for Instant View, not for looks – flatten
                 the user-agent styles they drag in so the bar renders as before. */
              .paste-id { color: var(--accent); font-weight: 600; font-size: inherit; }
              .paste-meta { color: var(--muted); font-style: normal; }
              .paste-meta time { color: inherit; }
              .paste-lang { background: var(--border); color: var(--fg); padding: 2px 8px; border-radius: 4px; font-size: 12px; }
              .paste-actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
              .paste-btn {
                background: var(--btn-bg);
                color: var(--fg);
                border: 1px solid var(--border);
                padding: 5px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-family: inherit;
                line-height: 1.5;
                text-decoration: none;
                white-space: nowrap;
              }
              .paste-btn:hover { background: var(--btn-hover); }
              .paste-btn[aria-pressed="true"] { background: var(--btn-hover); border-color: var(--accent); color: var(--accent); }
              .paste-theme { min-width: 34px; text-align: center; }

              .paste-body { padding: 20px max(20px, (100% - var(--measure)) / 2); }
              .paste-body pre {
                margin: 0;
                padding: 16px;
                background: var(--panel);
                border: 1px solid var(--border);
                border-radius: 6px;
                /* Code keeps its columns on a wide screen: horizontal scroll lives
                   inside this box, so the page itself never scrolls sideways. */
                white-space: pre;
                overflow-x: auto;
                tab-size: 2;
              }
              .paste-body pre code { font-size: 13px; }

              /* A rendered markdown paste is read, not scanned, so it gets prose
                 measure and prose spacing instead of the full-bleed code slab. */
              /* Prose wants a narrower column than code, and it sits in the middle
                 of the centred one rather than hugging its left edge. */
              .paste-md { max-width: 46rem; margin-inline: auto; overflow-wrap: break-word; }
              .paste-md > * + * { margin-top: 1em; }
              .paste-md h1, .paste-md h2, .paste-md h3, .paste-md h4 { line-height: 1.3; margin-top: 1.6em; }
              .paste-md h1 { font-size: 1.7em; }
              .paste-md h2 { font-size: 1.35em; }
              .paste-md h3 { font-size: 1.15em; }
              .paste-md ul, .paste-md ol { padding-left: 1.4em; }
              .paste-md li + li { margin-top: .3em; }
              .paste-md a { color: var(--accent); }
              .paste-md code {
                background: var(--panel);
                border: 1px solid var(--border);
                border-radius: 4px;
                padding: .1em .35em;
                font-size: .88em;
              }
              .paste-md pre code { background: none; border: 0; padding: 0; font-size: 13px; }
              .paste-md blockquote {
                border-left: 3px solid var(--border);
                padding-left: 1em;
                color: var(--muted);
              }
              .paste-md hr { border: 0; border-top: 1px solid var(--border); }
              .paste-md img { max-width: 100%; height: auto; }
              /* Tables scroll inside themselves; the page never scrolls sideways. */
              .paste-md table { display: block; width: max-content; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
              .paste-md th, .paste-md td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; }
              .paste-md th { background: var(--panel); }
              .paste-source { margin-top: 16px; }

              /* A phone is too narrow for columns. Wrap by default there – most of
                 what people paste and then read on a phone is prose, logs or stack
                 traces, none of which need alignment. `anywhere` covers the long
                 unbroken tokens (urls, base64, minified json) that break the layout. */
              @media (max-width: 760px) {
                .paste-body pre { white-space: pre-wrap; overflow-wrap: anywhere; }
                .paste-header { padding: 10px 12px; gap: 8px; }
                .paste-body { padding: 12px; }
                .paste-source { margin-top: 12px; }
                .paste-body pre { padding: 12px; }
                .paste-footer { padding: 8px 12px 20px; }
                /* Thumb-sized targets, and the row is allowed to take the full width
                   instead of squeezing five buttons into whatever is left. */
                .paste-actions { margin-left: 0; width: 100%; gap: 6px; }
                .paste-btn { padding: 7px 12px; }
                .paste-md h1 { font-size: 1.45em; }
                .paste-md h2 { font-size: 1.2em; }
              }

              /* The toggle wins over the media query in both directions. */
              body.wrap .paste-body pre { white-space: pre-wrap; overflow-wrap: anywhere; }
              body.nowrap .paste-body pre { white-space: pre; overflow-wrap: normal; }

              .paste-footer {
                padding: 8px max(20px, (100% - var(--measure)) / 2) 20px;
                font-size: 12px;
                color: var(--muted);
              }
              .paste-footer a { color: var(--accent); text-decoration: none; }
              .paste-footer a:hover { text-decoration: underline; }

              /* highlight.js palette, inlined instead of pulled from the CDN: one
                 stylesheet cannot follow a theme switch, and two fight each other. */
              .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag, .hljs-name { color: var(--hl-keyword); }
              .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-quote { color: var(--hl-string); }
              .hljs-comment, .hljs-meta .hljs-keyword { color: var(--hl-comment); font-style: italic; }
              .hljs-number, .hljs-symbol, .hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-selector-attr { color: var(--hl-number); }
              .hljs-title, .hljs-function .hljs-title, .hljs-section, .hljs-selector-id { color: var(--hl-title); }
              .hljs-type, .hljs-class .hljs-title, .hljs-built_in, .hljs-params { color: var(--hl-type); }
              .hljs-tag, .hljs-bullet, .hljs-link, .hljs-meta { color: var(--hl-tag); }
              .hljs-emphasis { font-style: italic; }
              .hljs-strong { font-weight: 600; }
              .hljs-deletion { color: var(--hl-keyword); }
            </style>
            </head>
            <body>
            <article>
            <div class="paste-header">
              <h1 class="paste-id">p/{{paste.PublicId}}</h1>
              <span class="paste-lang">{{langLabel}}</span>
              <address class="paste-meta"><time datetime="{{paste.CreatedAt:yyyy-MM-ddTHH:mm:sszzz}}">{{paste.CreatedAt:dd.MM.yyyy HH:mm}}</time>{{author}}{{sourceLabel}}</address>
              <div class="paste-actions">
                <button class="paste-btn paste-theme" onclick="toggleTheme()" data-theme-btn title="Светлая или темная тема" aria-label="Переключить тему">◐</button>
                {{viewToggle}}
                <button class="paste-btn" onclick="copyText()">Копировать</button>
                <a class="paste-btn" href="/api/pastes/{{paste.PublicId}}/raw">Raw</a>
                <a class="paste-btn" href="/paste/">+ Новый</a>
              </div>
            </div>
            <div class="paste-body">
              {{contentHtml}}
            </div>
            </article>
            <div class="paste-footer">
              <a href="/">Тимлид не кодит</a> ·
              paste-сервис сообщества ·
              создайте новый на <a href="/paste/">/paste/</a> или через бота <a href="https://t.me/temlead_helper_bot">@temlead_helper_bot</a>
            </div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" crossorigin="anonymous"></script>
            <script>hljs.highlightAll();</script>
            <script>
              // Wrapping is width-dependent by default (see the media query); the
              // toggle pins it and remembers the choice across pastes. Markdown pastes
              // render as prose and have no wrap button, hence the guard.
              (function () {
                var btn = document.querySelector('[data-wrap]');
                var pre = document.querySelector('.paste-body pre');
                if (!btn || !pre) return;

                var saved = null;
                try { saved = localStorage.getItem('paste-wrap'); } catch (e) {}
                if (saved) document.body.classList.add(saved);
                sync();

                function wrapped() {
                  return getComputedStyle(pre).whiteSpace === 'pre-wrap';
                }
                function sync() { btn.setAttribute('aria-pressed', wrapped() ? 'true' : 'false'); }

                window.toggleWrap = function () {
                  var next = wrapped() ? 'nowrap' : 'wrap';
                  document.body.classList.remove('wrap', 'nowrap');
                  document.body.classList.add(next);
                  try { localStorage.setItem('paste-wrap', next); } catch (e) {}
                  sync();
                };
                addEventListener('resize', sync);
              })();
            </script>
            <script>
              // The theme button. No saved choice means "follow the OS", which is why
              // the first click reads the computed background rather than assuming.
              (function () {
                var btn = document.querySelector('[data-theme-btn]');
                var root = document.documentElement;
                sync();

                function dark() {
                  var set = root.getAttribute('data-theme');
                  if (set) return set === 'dark';
                  return matchMedia('(prefers-color-scheme: dark)').matches;
                }
                function sync() {
                  var d = dark();
                  btn.textContent = d ? '☾' : '☀';
                  btn.title = d ? 'Включить светлую тему' : 'Включить темную тему';
                }

                window.toggleTheme = function () {
                  var next = dark() ? 'light' : 'dark';
                  root.setAttribute('data-theme', next);
                  try { localStorage.setItem('paste-theme', next); } catch (e) {}
                  sync();
                };
                matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
              })();
            </script>
            <script>
              // Markdown pastes only: flip between the rendered document and the source
              // it was written in. Both are already in the DOM, so this is just a class.
              (function () {
                var btn = document.querySelector('[data-source-btn]');
                var md = document.querySelector('[data-md]');
                var src = document.querySelector('[data-source]');
                if (!btn || !md || !src) return;

                window.toggleSource = function () {
                  var show = src.hasAttribute('hidden');
                  src.toggleAttribute('hidden', !show);
                  md.toggleAttribute('hidden', show);
                  btn.setAttribute('aria-pressed', show ? 'true' : 'false');
                  btn.textContent = show ? 'Документ' : 'Исходник';
                };
              })();
            </script>
            <script>
              function copyText() {
                // Always the source text, never the rendered markdown.
                navigator.clipboard.writeText(document.querySelector('[data-raw]').textContent).then(function () {
                  var b = document.querySelector('.paste-btn[onclick^="copyText"]');
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
        "markdown" => "Markdown",
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

    // Where a paste says it came from – a label on the page, nothing more. Whitelisted
    // rather than stored as sent: "bot" makes the page claim a Telegram origin next to an
    // author name, and only TelegramWebhookEndpoints has a Telegram update to back that
    // claim up. Anything unrecognised degrades to "web" instead of being rejected: the
    // shell and the form are the only callers, and a bad label is not worth a 400.
    public static string NormalizeSource(string? source) =>
        source?.Trim().ToLowerInvariant() switch
        {
            "shell" => "shell",
            _ => "web",
        };

    // The public create body. There is deliberately no author field of any kind here:
    // this endpoint has nothing to authenticate a claim of authorship with, so it does
    // not accept one. Unknown JSON members (including an "author_name" left over in an
    // old client, or supplied by an attacker) are ignored by the deserializer.
    private sealed record PasteBody(
        [property: JsonPropertyName("content")] string? Content,
        [property: JsonPropertyName("source")] string? Source,
        [property: JsonPropertyName("website")] string? Website);
}

file static class StringExtensions
{
    public static string Truncate(this string text, int limit) =>
        text.Length <= limit ? text : string.Concat(text.AsSpan(0, limit - 1), "…");
}
