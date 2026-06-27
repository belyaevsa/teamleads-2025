using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Security;

namespace TeamleadsBackend.Endpoints;

public static class SubmissionEndpoints
{
    public record SubmissionInput(
        [property: Required, StringLength(200, MinimumLength = 1)] string Title,
        [property: StringLength(32)] string? Type,
        [property: StringLength(512), Url] string? Url,
        [property: StringLength(120)] string? Author,
        [property: StringLength(2000)] string? Notes,
        string? Website);

    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase) { "showcase", "tool" };

    public static IEndpointRouteBuilder MapSubmissions(this IEndpointRouteBuilder api)
    {
        // Public: submit a project/tool for moderation. Rate-limited + validated + honeypot.
        api.MapPost("/submissions", async (SubmissionInput input, HttpContext http, AppDbContext db, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(input.Website)) return Results.Created("/api/submissions", null);
            if (Validation.Fails(input, out var errors)) return Results.ValidationProblem(errors);

            var type = input.Type?.Trim().ToLowerInvariant() ?? "showcase";
            if (!AllowedTypes.Contains(type))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["Type"] = [$"Type must be one of: {string.Join(", ", AllowedTypes)}"] });

            var row = new Submission
            {
                Type = type,
                Title = input.Title.Trim(),
                Url = input.Url?.Trim(),
                Author = input.Author?.Trim(),
                Notes = input.Notes?.Trim(),
                IpHash = ClientFingerprint.IpHash(http, cfg),
                CreatedAt = DateTimeOffset.UtcNow,
                Status = "pending",
            };
            db.Submissions.Add(row);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/submissions/{row.Id}", new { row.Id });
        })
        .RequireRateLimiting(Policies.PublicPost)
        .WithName("CreateSubmission");

        // Admin: moderation list, optionally filtered by status, newest first.
        api.MapGet("/submissions", async (AppDbContext db, string? status, int? take, CancellationToken ct) =>
        {
            var q = db.Submissions.AsNoTracking().OrderByDescending(s => s.CreatedAt).AsQueryable();
            if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
            var rows = await q.Take(Math.Clamp(take ?? 100, 1, 500)).ToListAsync(ct);
            return Results.Ok(rows);
        })
        .RequireApiKey()
        .WithName("ListSubmissions");

        return api;
    }
}
