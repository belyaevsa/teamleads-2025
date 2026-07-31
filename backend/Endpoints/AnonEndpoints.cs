using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Security;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Endpoints;

public static class AnonEndpoints
{
    // `Website` is the same honeypot the other public POSTs use.
    public record AnonInput(
        [property: Required, StringLength(4000, MinimumLength = 20)] string Text,
        [property: StringLength(16)] string? Source,
        string? Website);

    private static readonly HashSet<string> AllowedSources = new(StringComparer.OrdinalIgnoreCase) { "form", "shell", "context" };

    public static IEndpointRouteBuilder MapAnon(this IEndpointRouteBuilder api)
    {
        // Public: submit an anonymous question from the site form or the shell.
        // We store a salted hash of the IP (for flood control) and nothing else –
        // no session, no contact, no way back to the author.
        api.MapPost("/anon", async (AnonInput input, HttpContext http, AnonService anon, IConfiguration cfg,
            ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            // Id, source and size only. The text is the one thing we promised not to
            // keep, and a log file is still keeping it.
            var log = loggerFactory.CreateLogger("Anon");

            if (!string.IsNullOrEmpty(input.Website))
            {
                log.LogInformation("Anon request dropped: honeypot filled in (source {Source}).", input.Source ?? "form");
                return Results.Created("/api/anon", null); // bot: pretend success
            }
            if (Validation.Fails(input, out var errors))
            {
                log.LogInformation("Anon request rejected: {Length} chars failed validation ({Fields}).",
                    input.Text?.Length ?? 0, string.Join(", ", errors.Keys));
                return Results.ValidationProblem(errors);
            }

            var source = input.Source?.Trim().ToLowerInvariant() ?? "form";
            if (!AllowedSources.Contains(source)) source = "form";

            var (outcome, row) = await anon.CreateAsync(input.Text, source, ClientFingerprint.IpHash(http, cfg), ct);
            log.LogInformation("Anon request {Outcome} from {Source}: {PublicId}, {Length} chars.",
                outcome, source, row.PublicId, input.Text.Length);

            // Throttled submissions land here too, with an id that resolves nowhere.
            // Saying "you are flooding" would just teach a flooder to rotate IPs.
            return Results.Created($"/api/anon/{row.PublicId}", new { publicId = row.PublicId });
        })
        .RequireRateLimiting(Policies.AnonPost)
        .WithName("CreateAnonRequest");

        // Admin: audit list. Deliberately projects a subset – AuthorHash never
        // leaves the database, not even to an authenticated admin.
        api.MapGet("/anon", async (AppDbContext db, string? status, int? take, CancellationToken ct) =>
        {
            var q = db.AnonRequests.AsNoTracking().OrderByDescending(r => r.CreatedAt).AsQueryable();
            if (!string.IsNullOrEmpty(status)) q = q.Where(r => r.Status == status);

            var rows = await q.Take(Math.Clamp(take ?? 100, 1, 500))
                .Select(r => new
                {
                    r.PublicId,
                    r.Text,
                    r.EditedText,
                    r.Source,
                    r.Status,
                    r.CreatedAt,
                    r.ModeratedAt,
                    r.PublishedMessageId,
                })
                .ToListAsync(ct);

            return Results.Ok(rows);
        })
        .RequireApiKey()
        .WithName("ListAnonRequests");

        return api;
    }
}
