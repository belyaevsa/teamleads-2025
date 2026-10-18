using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Transcription;

// The worker half of voice transcription: one job from "pending" to a paste link in the
// chat.
//
//   download   – the voice, through the chat port (getFile + the file server);
//   transcribe – voice.stt_model, the raw words with every "э-э" in them;
//   restructure – voice.llm_model, the same words as a document with sections;
//   publish    – a markdown paste, and the "расшифровываю" reply edited into its link.
//
// Two models rather than one that hears audio: each does one job, either can be swapped
// with /set, and when the second one fails the first one's work is not thrown away – the
// unedited transcript is published instead, marked as such. Paying for the speech
// recognition and then answering "не получилось" would be the worst of both.
public sealed class VoiceTranscriber(
    AppDbContext db,
    IChatSender chat,
    OpenRouterClient openRouter,
    SettingsService settings,
    IConfiguration cfg,
    ILogger<VoiceTranscriber> log)
{
    // Backoff per attempt, then give up. Short, unlike the outbox's: someone is waiting
    // in the chat for this, and a retry an hour later answers a question nobody is still
    // asking.
    private static readonly TimeSpan[] Backoff = [TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(3)];

    // A transcript paste lives longer than a /paste of a log: a link handed out again by
    // the dedupe check should still open next month.
    private static readonly TimeSpan PasteLifetime = TimeSpan.FromDays(30);

    private const int MaxPasteLength = 64 * 1024;

    // 15 minutes of speech is ~2,500 words, ~5,000 tokens of Russian. Twice that leaves
    // room without letting a runaway reply bill forever.
    private const int MaxOutputTokens = 12_000;

    public const string Prompt = """
        Ты редактор. На входе – автоматическая расшифровка голосового сообщения.
        Преврати её в аккуратный markdown-документ на языке оригинала.

        Структура:
        - Первая строка: заголовок "# " – короткая тема сообщения, не больше 8 слов.
        - Затем смысловые разделы с заголовками "## ". Разделы крупные: один раздел – одна большая тема,
          а не каждая новая мысль. На всё сообщение – от 3 до 6 разделов, даже если оно длинное.
          Если сообщение короче двух минут, разделы не нужны.
        - Списки – только там, где автор действительно перечисляет.

        Редактура:
        - Убери слова-паразиты, повторы, оговорки и звуки: э-э, м-м, ну, вот, короче, как бы, типа, а-ля,
          в общем, скажем так – когда они не несут смысла.
        - Исправь очевидные ошибки распознавания, если смысл однозначен (например "инпоинты" -> "эндпоинты").
        - Сохрани речь от первого лица, голос автора и все факты. Ничего не добавляй от себя, не обобщай,
          не делай выводов и не давай советов, которых не было в речи.

        Оформление:
        - Для тире используй только короткое тире "–", никогда длинное "—".
        - Верни только markdown, без пояснений до или после и без обёртки в ```.
        """;

    // Drains every due job, one at a time. One at a time on purpose: these calls are
    // slow and paid, and a burst of voices is better served in order than all at once
    // against a provider that may be rate-limiting the key.
    public async Task<int> ProcessDueAsync(CancellationToken ct)
    {
        var processed = 0;
        while (!ct.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;
            var job = await db.VoiceTranscriptions
                .Where(v => v.Status == "pending" && v.NextAttemptAt <= now)
                .OrderBy(v => v.NextAttemptAt)
                .FirstOrDefaultAsync(ct);
            if (job is null) break;

            await ProcessAsync(job, ct);
            processed++;
        }
        return processed;
    }

    // A job left "running" was cut off by a restart mid-flight. Nothing it did is kept,
    // so it simply runs again; the attempt it was on still counts.
    public async Task<int> RequeueInterruptedAsync(CancellationToken ct)
    {
        var stuck = await db.VoiceTranscriptions.Where(v => v.Status == "running").ToListAsync(ct);
        foreach (var job in stuck)
        {
            job.Status = "pending";
            job.NextAttemptAt = DateTimeOffset.UtcNow;
        }
        if (stuck.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            log.LogInformation("Voice transcription requeued {Count} job(s) interrupted by a restart: {Ids}.",
                stuck.Count, string.Join(", ", stuck.Select(j => j.Id)));
        }
        return stuck.Count;
    }

    public async Task ProcessAsync(VoiceTranscription job, CancellationToken ct)
    {
        job.Status = "running";
        job.Attempts++;
        await db.SaveChangesAsync(ct);

        var started = DateTimeOffset.UtcNow;
        try
        {
            var (paste, cost, edited) = await TranscribeAsync(job, ct);

            job.Status = "done";
            job.PastePublicId = paste.PublicId;
            job.CostUsd = cost;
            job.LastError = edited ? null : "restructure failed, published the raw transcript";
            job.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            log.LogInformation(
                "Voice transcription {Id} done in {Elapsed:0.0}s on attempt {Attempt}: paste {PublicId}, {Length} chars, {Mode}, ${Cost}.",
                job.Id, (DateTimeOffset.UtcNow - started).TotalSeconds, job.Attempts, paste.PublicId,
                paste.Content.Length, edited ? "restructured" : "raw transcript", cost);

            await AnnounceAsync(job,
                $"📋 Расшифровка голосового: {TelegramWebhookEndpoints.PasteLink(paste.PublicId, cfg)}\n\n" +
                $"Длительность: {VoicePasteService.Clock(job.DurationSeconds)}, автор: {job.AuthorName}" +
                (edited ? "" : "\nРедактура не удалась – это текст как есть, без разделов."),
                disablePreview: false, ct);
        }
        catch (TranscriptionException ex)
        {
            await FailAsync(job, ex.Message, ex.Retryable, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            // Anything else – the database, a bug – is retried like a provider error rather
            // than left "running" until the next restart notices it.
            log.LogError(ex, "Voice transcription {Id} threw.", job.Id);
            await FailAsync(job, ex.Message, retryable: true, ct);
        }
    }

    private async Task<(Paste Paste, decimal Cost, bool Edited)> TranscribeAsync(VoiceTranscription job, CancellationToken ct)
    {
        var file = await chat.DownloadFileAsync(job.FileId, ct);
        if (!file.Ok) throw new TranscriptionException($"скачивание: {file.Error}", retryable: true);

        var sttModel = await settings.GetRawAsync("voice.stt_model", ct);
        var heard = await openRouter.TranscribeAsync(file.Content!, "voice.oga", sttModel, ct);
        if (!heard.Ok) throw new TranscriptionException($"распознавание: {heard.Error}", retryable: true);
        if (string.IsNullOrWhiteSpace(heard.Text))
            throw new TranscriptionException("в голосовом не распознано ни слова", retryable: false);

        // Asked twice before giving up on it. OpenRouter spreads this model over dozens of
        // providers and one of them occasionally refuses a perfectly good request; the
        // second try usually lands elsewhere, and it is cheap next to the recognition.
        var llmModel = await settings.GetRawAsync("voice.llm_model", ct);
        var edited = await openRouter.CompleteAsync(llmModel, Prompt, heard.Text, MaxOutputTokens, ct);
        if (!edited.Ok)
        {
            log.LogInformation("Voice transcription {Id}: restructuring failed ({Error}), asking once more.", job.Id, edited.Error);
            edited = await openRouter.CompleteAsync(llmModel, Prompt, heard.Text, MaxOutputTokens, ct);
        }
        if (!edited.Ok)
            log.LogWarning("Voice transcription {Id}: restructuring failed ({Error}), publishing the raw transcript.",
                job.Id, edited.Error);

        var content = edited.Ok
            ? Document(edited.Text!, job.DurationSeconds)
            : RawDocument(heard.Text, job.DurationSeconds);
        if (content.Length > MaxPasteLength) content = content[..(MaxPasteLength - 1)] + "…";

        var paste = new Paste
        {
            PublicId = await PasteEndpoints.GeneratePublicIdAsync(db, ct),
            Content = content,
            // Not detected: this is markdown because we asked for markdown, and a
            // transcript is exactly the long-prose shape the detector is least sure of.
            Language = "markdown",
            AuthorName = job.AuthorName,
            AuthorTgId = job.AuthorTgId,
            Source = "bot",
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.Add(PasteLifetime),
        };
        db.Pastes.Add(paste);
        await db.SaveChangesAsync(ct);

        return (paste, heard.Cost + edited.Cost, edited.Ok);
    }

    private async Task FailAsync(VoiceTranscription job, string error, bool retryable, CancellationToken ct)
    {
        job.LastError = error.Length > 512 ? error[..512] : error;
        var retry = retryable && job.Attempts <= Backoff.Length;

        if (retry)
        {
            job.Status = "pending";
            job.NextAttemptAt = DateTimeOffset.UtcNow + Backoff[job.Attempts - 1];
            await db.SaveChangesAsync(ct);
            log.LogWarning("Voice transcription {Id} attempt {Attempt} failed, retrying at {NextAttempt:u}: {Error}",
                job.Id, job.Attempts, job.NextAttemptAt, job.LastError);
            return;
        }

        job.Status = "failed";
        job.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        log.LogWarning("Voice transcription {Id} gave up after {Attempts} attempt(s): {Error}",
            job.Id, job.Attempts, job.LastError);

        // A failed job is not a dead end: the next /paste on the same voice starts it over.
        await AnnounceAsync(job, retryable
            ? "Не получилось расшифровать голосовое – сервис распознавания не ответил. Попробуйте /paste еще раз чуть позже."
            : "Не получилось расшифровать голосовое: в нем не распознано ни слова.",
            disablePreview: true, ct);
    }

    // The "расшифровываю" reply becomes the answer, in place. Edits always go out with the
    // preview off (see ChatEdit), so where the status reply is missing or the edit fails,
    // a fresh reply under the voice carries the answer instead – a lost status message
    // must not turn into a lost link.
    private async Task AnnounceAsync(VoiceTranscription job, string text, bool disablePreview, CancellationToken ct)
    {
        if (job.StatusMessageId != 0)
        {
            var edit = await chat.EditMessageTextAsync(new ChatEdit(job.ChatId, job.StatusMessageId, text), ct);
            if (edit.Ok) return;
            log.LogWarning("Voice transcription {Id}: editing the status reply failed ({Error}), sending a new one.",
                job.Id, edit.Error);
        }

        var sent = await chat.SendMessageAsync(new ChatMessage(job.ChatId, text,
            DisablePreview: disablePreview, ReplyToMessageId: job.VoiceMessageId), ct);
        if (!sent.Ok)
            log.LogWarning("Voice transcription {Id}: the answer could not be delivered: {Error}", job.Id, sent.Error);
    }

    // The model's document, plus one line under its title saying what this is. A reader
    // who lands on the paste must be able to tell an edited transcript from someone's
    // essay, and the model is told not to add anything of its own – so the code adds it.
    public static string Document(string markdown, int durationSeconds)
    {
        var text = StripFence(markdown.Trim());
        var note = $"*Расшифровка голосового, {VoicePasteService.Clock(durationSeconds)}. " +
                   "Текст отредактирован нейросетью: убраны слова-паразиты и повторы, добавлены разделы.*";

        if (!text.StartsWith("# ", StringComparison.Ordinal))
            return $"# Голосовое сообщение\n\n{note}\n\n{text}\n";

        var lineEnd = text.IndexOf('\n');
        var title = lineEnd < 0 ? text : text[..lineEnd];
        var body = lineEnd < 0 ? "" : text[(lineEnd + 1)..].TrimStart('\n');
        return $"{title}\n\n{note}\n\n{body}\n";
    }

    public static string RawDocument(string transcript, int durationSeconds) =>
        $"# Голосовое сообщение\n\n*Расшифровка голосового, {VoicePasteService.Clock(durationSeconds)}, без редактуры.*\n\n{transcript.Trim()}\n";

    // Told not to, a model still sometimes wraps the whole answer in ```markdown … ```.
    private static string StripFence(string text)
    {
        if (!text.StartsWith("```", StringComparison.Ordinal) || !text.EndsWith("```", StringComparison.Ordinal))
            return text;
        var firstLineEnd = text.IndexOf('\n');
        return firstLineEnd < 0 ? text : text[(firstLineEnd + 1)..^3].Trim();
    }

    private sealed class TranscriptionException(string message, bool retryable) : Exception(message)
    {
        public bool Retryable { get; } = retryable;
    }
}
