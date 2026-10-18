using Microsoft.Extensions.Options;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Transcription;

// Runs queued voice transcriptions: woken by VoiceQueueSignal the moment the webhook
// queues one, and every 30 seconds regardless, which is what picks up retries whose
// backoff has passed.
//
// Its own loop rather than a job on OutboxDispatcher: a transcription takes up to a
// minute, and a moderation card must not wait behind one.
//
// Idle while either side is unconfigured – no Telegram token means no file to fetch and
// no chat to answer, no OpenRouter key means nothing to transcribe with. Jobs stay
// pending and run once the missing piece arrives.
public sealed class VoiceTranscriptionWorker(
    IServiceScopeFactory scopes,
    VoiceQueueSignal signal,
    IOptions<TelegramOptions> telegram,
    IOptions<OpenRouterOptions> openRouter,
    ILogger<VoiceTranscriptionWorker> log) : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await RunAsync(t => t.RequeueInterruptedAsync(ct), "requeue on startup");

        while (!ct.IsCancellationRequested)
        {
            if (telegram.Value.Enabled && openRouter.Value.Enabled)
                await RunAsync(t => t.ProcessDueAsync(ct), "processing");

            try { await signal.WaitAsync(Tick, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    // A fresh scope per pass: the DbContext must not live as long as the process.
    private async Task RunAsync(Func<VoiceTranscriber, Task<int>> work, string what)
    {
        try
        {
            using var scope = scopes.CreateScope();
            await work(scope.ServiceProvider.GetRequiredService<VoiceTranscriber>());
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { log.LogError(ex, "Voice transcription {What} failed.", what); }
    }
}
