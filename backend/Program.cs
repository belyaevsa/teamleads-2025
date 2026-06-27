using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Security;

var builder = WebApplication.CreateBuilder(args);

// ── Logging standard ────────────────────────────────────────────────────────
// One console sink, structured. Production emits JSON (one object per line) so
// `docker logs` / any aggregator can parse it; Development stays human-readable.
// Levels are tuned in appsettings.json. Scopes are on, so the request method/path
// and any BeginScope context ride along with every line.
builder.Logging.ClearProviders();
if (builder.Environment.IsDevelopment())
{
    builder.Logging.AddSimpleConsole(o =>
    {
        o.IncludeScopes = true;
        o.SingleLine = true;
        o.TimestampFormat = "HH:mm:ss ";
    });
}
else
{
    builder.Logging.AddJsonConsole(o =>
    {
        o.IncludeScopes = true;
        o.UseUtcTimestamp = true;
        o.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
    });
}

// ── Services ────────────────────────────────────────────────────────────────
var conn = builder.Configuration.GetConnectionString("Default")
           ?? throw new InvalidOperationException("ConnectionStrings__Default is not configured.");

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(conn, npg => npg.EnableRetryOnFailure()));

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();   // uniform RFC7807 error bodies

// Structured access log: one line per request with method, path, status, duration.
builder.Services.AddHttpLogging(o =>
{
    o.LoggingFields = HttpLoggingFields.RequestMethod
                    | HttpLoggingFields.RequestPath
                    | HttpLoggingFields.ResponseStatusCode
                    | HttpLoggingFields.Duration;
    o.CombineLogs = true;
});

// Per-client fixed-window limiter for the public POSTs (5/min/IP). The partition
// key is the real client IP from X-Forwarded-For (see ClientFingerprint).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(Policies.PublicPost, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ClientFingerprint.ClientIp(http),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// In Development the Hugo dev server (localhost:1313) calls us cross-origin.
// In production nginx makes everything same-origin, so CORS is dev-only.
const string DevCors = "dev-cors";
builder.Services.AddCors(o => o.AddPolicy(DevCors, p =>
    p.WithOrigins("http://localhost:1313", "http://127.0.0.1:1313").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// ── Pipeline ────────────────────────────────────────────────────────────────
app.UseExceptionHandler();   // unhandled errors -> ProblemDetails (framework logs them at Error)
app.UseHttpLogging();
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

// ── Startup migration with retry ────────────────────────────────────────────
// The remote pgsql can briefly be unreachable during a deploy, so retry a few
// times before giving up. On final failure we exit non-zero and let Docker's
// `--restart unless-stopped` bring us back, rather than serve with a stale schema.
await MigrateWithRetryAsync(app);

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
