using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Security;

namespace TeamleadsBackend.Endpoints;

public static class FeedbackEndpoints
{
    // `Website` is a honeypot: real users never see/fill it, bots do – non-empty => silently dropped.
    public record FeedbackInput(
        [property: Required, StringLength(4000, MinimumLength = 1)] string Message,
        [property: StringLength(512)] string? Page,
        [property: StringLength(256)] string? Contact,
        string? Website);

    public static IEndpointRouteBuilder MapFeedback(this IEndpointRouteBuilder api)
    {
        // Public: leave feedback. Rate-limited + validated + honeypot-guarded.
        api.MapPost("/feedback", async (FeedbackInput input, HttpContext http, AppDbContext db, IConfiguration cfg, CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(input.Website)) return Results.Created("/api/feedback", null); // bot: pretend success
            if (Validation.Fails(input, out var errors)) return Results.ValidationProblem(errors);

            var row = new Feedback
            {
                Message = input.Message.Trim(),
                Page = input.Page?.Trim(),
                Contact = input.Contact?.Trim(),
                IpHash = ClientFingerprint.IpHash(http, cfg),
                CreatedAt = DateTimeOffset.UtcNow,
            };
            db.Feedback.Add(row);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/feedback/{row.Id}", new { row.Id });
        })
        .RequireRateLimiting(Policies.PublicPost)
        .WithName("CreateFeedback");

        // Admin: moderation list, newest first.
        api.MapGet("/feedback", async (AppDbContext db, bool? handled, int? take, CancellationToken ct) =>
        {
            var q = db.Feedback.AsNoTracking().OrderByDescending(f => f.CreatedAt).AsQueryable();
            if (handled is { } h) q = q.Where(f => f.Handled == h);
            var rows = await q.Take(Math.Clamp(take ?? 100, 1, 500)).ToListAsync(ct);
            return Results.Ok(rows);
        })
        .RequireApiKey()
        .WithName("ListFeedback");

        return api;
    }
}
