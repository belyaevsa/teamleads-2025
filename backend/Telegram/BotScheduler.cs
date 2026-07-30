using Microsoft.Extensions.Options;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Telegram;

// The bot's own clock: posts the weekly dilemma and reveals the previous one.
//
// Ticks every five minutes and asks "is it time yet" rather than sleeping until the
// next slot, so a restart or a deploy can't skip a window. Idempotency lives in the
// database (BotPost), not in this loop's memory – two ticks inside the same hour, or
// a container swap mid-window, still produce exactly one post.
//
// Schedule and the master switch are read from SettingsService on every tick, not at
// startup: turning the bot off has to be a database write from a phone, not a deploy.
// SettingsService caches for five minutes, so a change lands within two ticks.
//
// The posting budget from bot-scenarios.md is enforced here by construction: this
// service can emit at most one dilemma and one reveal per week.
public sealed class BotScheduler(
    IServiceScopeFactory scopes,
    SettingsService settings,
    IOptions<TelegramOptions> options,
    ILogger<BotScheduler> log) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan AlmatyOffset = TimeSpan.FromHours(5);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!options.Value.Enabled)
        {
            log.LogInformation("Bot scheduler idle: Telegram is not configured.");
            return;
        }

        using var timer = new PeriodicTimer(Tick);
        do
        {
            try { await RunOnceAsync(ct); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Scheduler tick failed."); }
        }
        while (await timer.WaitForNextTickAsync(ct));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        if (!await settings.GetBoolAsync("tg.scheduler.enabled", ct)) return;

        var now = DateTimeOffset.UtcNow.ToOffset(AlmatyOffset);

        await RunDilemmaAsync(now, ct);
        await RunQuestionAsync(now, ct);
    }

    private async Task RunDilemmaAsync(DateTimeOffset now, CancellationToken ct)
    {
        var day = (DayOfWeek)await settings.GetIntAsync("tg.dilemma.dow", ct);
        var hour = await settings.GetIntAsync("tg.dilemma.hour", ct);
        var revealAfter = TimeSpan.FromHours(await settings.GetIntAsync("tg.dilemma.reveal_hours", ct));

        using var scope = scopes.CreateScope();
        var dilemmas = scope.ServiceProvider.GetRequiredService<DilemmaService>();

        if (now.DayOfWeek == day && now.Hour == hour)
        {
            var result = await dilemmas.PostIfDueAsync(TimeSpan.FromDays(3), ct);
            if (result is not null) log.LogInformation("Scheduled dilemma: {Result}", result);
        }

        var reveal = await dilemmas.FollowUpAsync(revealAfter, ct);
        if (!reveal.StartsWith("Нечего", StringComparison.Ordinal)) log.LogInformation("Scheduled reveal: {Result}", reveal);
    }

    private async Task RunQuestionAsync(DateTimeOffset now, CancellationToken ct)
    {
        var day = (DayOfWeek)await settings.GetIntAsync("tg.question.dow", ct);
        var hour = await settings.GetIntAsync("tg.question.hour", ct);

        if (now.DayOfWeek != day || now.Hour != hour) return;

        using var scope = scopes.CreateScope();
        var questions = scope.ServiceProvider.GetRequiredService<QuestionService>();
        var result = await questions.PostIfDueAsync(TimeSpan.FromDays(3), ct);
        if (result is not null) log.LogInformation("Scheduled question: {Result}", result);
    }
}
