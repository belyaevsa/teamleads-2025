using Microsoft.Extensions.Options;

namespace TeamleadsBackend.Telegram;

// Drains the outbox every 30 seconds.
//
// Separate from BotScheduler on purpose: that one decides *whether* to post something
// this week, this one only delivers what has already been decided. Different cadence
// (seconds vs minutes) and different failure meaning – a scheduler that skips a tick
// costs nothing, a dispatcher that skips a tick delays a moderation card.
//
// While Telegram is unconfigured it stays idle and leaves everything pending, so the
// backlog flushes on its own once the token arrives. That is the "the bot was disabled,
// deliver the last one" case.
public sealed class OutboxDispatcher(
    IServiceScopeFactory scopes,
    IOptions<TelegramOptions> options,
    ILogger<OutboxDispatcher> log) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await RequeueFailedAsync(ct);

        using var timer = new PeriodicTimer(Tick);
        do
        {
            try
            {
                // Re-read per tick rather than capturing at startup: the container may
                // have booted before the token was configured.
                if (!options.Value.Enabled) continue;

                using var scope = scopes.CreateScope();
                var outbox = scope.ServiceProvider.GetRequiredService<Outbox>();
                var sent = await outbox.DispatchDueAsync(ct);
                if (sent > 0) log.LogInformation("Outbox delivered {Count} message(s).", sent);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Outbox dispatch failed."); }
        }
        while (await timer.WaitForNextTickAsync(ct));
    }

    // Deliberately outside the Enabled check and ahead of the first tick: reviving a row
    // is a database write that costs nothing while Telegram is unconfigured, and the
    // messages it revives are exactly the ones a fresh deploy is most likely to fix.
    // It never takes the process down – a failure here means old messages stay failed,
    // which is where they already were.
    private async Task RequeueFailedAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            await scope.ServiceProvider.GetRequiredService<Outbox>().RequeueFailedAsync(ct);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { log.LogError(ex, "Outbox requeue on startup failed."); }
    }
}
