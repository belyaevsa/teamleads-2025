using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;

namespace TeamleadsBackend.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealth(this IEndpointRouteBuilder api)
    {
        // Liveness: the process is up and serving. Independent of the database so the
        // CI health-gate and any uptime check pass the moment the app is ready.
        api.MapGet("/health", () => Results.Ok(new { status = "ok" }))
           .WithName("Health")
           .AllowAnonymous();

        // Readiness: can we actually reach pgsql right now? Used to diagnose DB issues.
        api.MapGet("/health/ready", async (AppDbContext db, CancellationToken ct) =>
        {
            var ok = await db.Database.CanConnectAsync(ct);
            return ok
                ? Results.Ok(new { status = "ready", db = "up" })
                : Results.Json(new { status = "degraded", db = "down" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }).WithName("HealthReady");

        return api;
    }
}
