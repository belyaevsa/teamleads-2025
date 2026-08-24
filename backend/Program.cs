using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeamleadsBackend.BotData;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Search;
using TeamleadsBackend.Security;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

var builder = WebApplication.CreateBuilder(args);

// ── Logging standard ────────────────────────────────────────────────────────
// One console sink, one line per event, readable in `docker logs` without a JSON
// parser. Set LOG_FORMAT=json to switch to structured output if an aggregator that
// wants it ever appears.
//
// Scopes stay OFF in production. They repeat the request path on every line, which
// is both noise (the access log already reports method/path/status) and a leak: the
// Telegram webhook carries its secret in the path, and a scope prefix would print it
// on every log line the request produces. See Security/AccessLog.cs for the other half.
builder.Logging.ClearProviders();
if (string.Equals(builder.Configuration["LOG_FORMAT"], "json", StringComparison.OrdinalIgnoreCase))
{
    builder.Logging.AddJsonConsole(o =>
    {
        o.IncludeScopes = true;
        o.UseUtcTimestamp = true;
        o.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
    });
}
else
{
    var development = builder.Environment.IsDevelopment();
    builder.Logging.AddSimpleConsole(o =>
    {
        o.IncludeScopes = development;
        o.SingleLine = true;
        o.UseUtcTimestamp = !development;
        o.TimestampFormat = development ? "HH:mm:ss " : "yyyy-MM-dd HH:mm:ss ";
    });
}

// ── Services ────────────────────────────────────────────────────────────────
// Supplied as the ConnectionStrings__Default env var (double underscore = nested key);
// the environment provider is part of Configuration and overrides appsettings.json.
// Checked for empty, not just null: appsettings.json holds "" as a placeholder, so a
// missing env var yields an empty string and `?? throw` would never fire – the app
// would boot and fail later inside Npgsql with a far less obvious message.
var conn = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(conn))
    throw new InvalidOperationException("ConnectionStrings__Default is not configured.");

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(conn, npg => npg.EnableRetryOnFailure()));

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();   // uniform RFC7807 error bodies

// Access logging lives in the AccessLog middleware (failures only) rather than in
// HttpLogging, which has no way to stay silent on success. See Security/AccessLog.cs.

// Per-client fixed-window limiter for the public POSTs (5/min/IP). The partition
// key is the real client IP from X-Forwarded-For (see ClientFingerprint).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(Policies.PublicPost, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ClientFingerprint.ClientIp(http),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    o.AddPolicy(Policies.AnonPost, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ClientFingerprint.ClientIp(http),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));

    o.AddPolicy("paste_post", http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ClientFingerprint.ClientIp(http),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// ── Telegram bot (anonymous requests) ───────────────────────────────────────
// Flat env vars, validated in TelegramOptions.Enabled. With the bot unconfigured
// the webhook 404s and /api/anon still stores requests – nothing else breaks.
builder.Services.AddSingleton(Options.Create(TelegramOptions.FromConfiguration(builder.Configuration)));

var tgOptions = TelegramOptions.FromConfiguration(builder.Configuration);
builder.Services.AddHttpClient<TelegramClient>(c =>
{
    c.BaseAddress = new Uri(tgOptions.ApiBase);
    c.Timeout = TimeSpan.FromSeconds(15);   // the webhook must answer fast; Telegram redelivers otherwise
});
// Bucketlab.Telebot's client, pointed at the same base address and timeout as the typed
// client above.
//
// Until 0.0.72 there was nowhere to put either: the transport owned a private static
// HttpClient hardcoded to api.telegram.org with a 30s timeout, so TG_API_BASE did not
// reach the client that actually ships, and `docker compose up` could not route the bot
// at dev/telegram-stub.py. DefaultTransportOptions fixes that, and the 15s timeout is the
// same reasoning as above – the webhook has to answer fast, or Telegram redelivers.
builder.Services.AddSingleton<Telebot.ITelegramClient>(_ =>
    new Telebot.Telegram(
        new Telebot.DefaultTelegramTransport(new Telebot.DefaultTransportOptions
        {
            BaseAddress = new Uri(tgOptions.ApiBase),
            Timeout = TimeSpan.FromSeconds(15),
        }),
        tgOptions.BotToken ?? string.Empty));

// Everything that can go through the port does, and this is the line that decides which
// client that is. See IChatSender.cs for the one call that cannot – answerInlineQuery –
// and why it takes TelegramClient directly; stopPoll was the second until 0.0.75 put it
// behind the port and DilemmaService gave up its concrete client.
// BotApiChatSender (the hand-rolled client behind the same port) stays available, is what
// TelegramClientWireTests pins, and is the fallback if this package has to be backed out.
builder.Services.AddScoped<IChatSender, TelebotChatSender>();

builder.Services.AddSingleton<SettingsService>();   // process-wide 5-minute cache
builder.Services.AddScoped<Outbox>();
builder.Services.AddScoped<AnonService>();
builder.Services.AddScoped<DilemmaService>();
builder.Services.AddScoped<QuestionService>();

// Archive feed (/bot-data.json) & search index (/shell-index.json): the bot reads content
// from the site rather than keeping its own copy. See BotData/BotDataClient.cs and Search/ShellIndexClient.cs.
builder.Services.AddHttpClient<BotDataClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient<ShellIndexClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddSingleton<SearchService>();
builder.Services.AddHostedService<BotScheduler>();
builder.Services.AddHostedService<OutboxDispatcher>();

// In Development the Hugo dev server (localhost:1313) calls us cross-origin.
// In production nginx makes everything same-origin, so CORS is dev-only.
const string DevCors = "dev-cors";
builder.Services.AddCors(o => o.AddPolicy(DevCors, p =>
    p.WithOrigins("http://localhost:1313", "http://127.0.0.1:1313").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// ── Pipeline ────────────────────────────────────────────────────────────────
app.UseExceptionHandler();   // unhandled errors -> ProblemDetails (framework logs them at Error)
app.UseMiddleware<AccessLog>();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.UseCors(DevCors);
    app.MapOpenApi();         // /openapi/v1.json + Swagger-able in dev
}

// All endpoints live under /api (nginx proxies /api/ here and keeps the prefix).
var api = app.MapGroup("/api");
api.MapHealth();
api.MapFeedback();
api.MapSubmissions();
api.MapAnon();
api.MapSettings();
api.MapTelegramWebhook();
api.MapPastes();

// Paste viewing pages at clean /p/{id} URLs.
PasteEndpoints.MapPastePage(app);

// ── Startup migration with retry ────────────────────────────────────────────
// The remote pgsql can briefly be unreachable during a deploy, so retry a few
// times before giving up. On final failure we exit non-zero and let Docker's
// `--restart unless-stopped` bring us back, rather than serve with a stale schema.
await MigrateWithRetryAsync(app);

// After the migrations, so the seeded rows are in the snapshot, and before the first
// request or background tick, so "what does this process believe?" is answered in the
// log at boot rather than whenever something happens to ask first.
await app.Services.GetRequiredService<SettingsService>().WarmUpAsync(CancellationToken.None);

app.Run();

static async Task MigrateWithRetryAsync(WebApplication app)
{
    var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup.Migrate");
    const int attempts = 5;
    for (var i = 1; i <= attempts; i++)
    {
        try
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
            logger.LogInformation("Database migrations applied (attempt {Attempt}/{Attempts}).", i, attempts);
            return;
        }
        catch (Exception ex) when (i < attempts)
        {
            var delay = TimeSpan.FromSeconds(2 * i);
            logger.LogWarning(ex, "Migration attempt {Attempt}/{Attempts} failed; retrying in {Delay}s.", i, attempts, delay.TotalSeconds);
            await Task.Delay(delay);
        }
        // On the final attempt the catch filter is false, so a failure propagates
        // out of here and stops the app (Docker then restarts it).
    }
}

// Exposed so tests/tooling can reference the entry assembly if needed.
public partial class Program { }
