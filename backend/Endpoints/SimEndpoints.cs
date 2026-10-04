using System.ComponentModel.DataAnnotations;
using TeamleadsBackend.Security;
using TeamleadsBackend.Sim;

namespace TeamleadsBackend.Endpoints;

// The shell simulator's answers: what visitors picked, and how everyone picked.
// See Sim/SimVotes.cs for why the site and chat counts are kept separate.
public static class SimEndpoints
{
    // `Client` is a random id the browser keeps in localStorage – best-effort dedup only,
    // stored salted and hashed, never raw. A cleared storage simply counts as a new voter.
    public record AnswerInput(
        [property: Required, StringLength(128, MinimumLength = 1)] string ScenarioId,
        [property: Range(0, 9)] int Option,
        [property: StringLength(64)] string? Client);

    public static IEndpointRouteBuilder MapSim(this IEndpointRouteBuilder api)
    {
        api.MapPost("/sim/answer", async (AnswerInput input, SimVotes votes, IConfiguration cfg, CancellationToken ct) =>
        {
            if (Validation.Fails(input, out var errors)) return Results.ValidationProblem(errors);

            var client = string.IsNullOrWhiteSpace(input.Client) ? null : ClientFingerprint.Hash("sim|" + input.Client.Trim(), cfg);
            return await votes.RecordAsync(input.ScenarioId, input.Option, client, ct) switch
            {
                SimVotes.RecordResult.Recorded => Results.NoContent(),
                // Not an error for the visitor: their answer is already in the count.
                SimVotes.RecordResult.Duplicate => Results.NoContent(),
                SimVotes.RecordResult.FeedUnavailable => Results.StatusCode(StatusCodes.Status503ServiceUnavailable),
                _ => Results.NotFound(),
            };
        })
        .RequireRateLimiting(Policies.SimPost)
        .WithName("RecordSimAnswer");

        api.MapGet("/sim/stats", async (SimVotes votes, HttpContext http, CancellationToken ct) =>
        {
            var all = await votes.AllAsync(ct);
            if (all is null) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
            http.Response.Headers.CacheControl = "no-cache";
            return Results.Ok(new
            {
                percentFrom = SimVotes.PercentFrom,
                scenarios = all.ToDictionary(
                    kv => kv.Key,
                    kv => new
                    {
                        site = kv.Value.Site is { } s ? new { counts = s.Counts, total = s.Total } : null,
                        chat = kv.Value.Chat is { } c ? new { counts = c.Counts, total = c.Total } : null,
                    }),
            });
        })
        .WithName("SimStats");

        return api;
    }
}
