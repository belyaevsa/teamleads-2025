using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using TeamleadsBackend.Transcription;
using Xunit;

namespace TeamleadsBackend.Tests;

// The worker side of voice transcription: a queued job, through download, speech to text
// and restructuring, to a paste and a link in the chat.
//
// Telegram is the fake port (the file comes out of FakeChatSender.Files) and OpenRouter is
// a stub socket, so the assertions land on what was really sent to the models and what
// really came back to the chat.
public sealed class VoiceTranscriberTests : IDisposable
{
    private const long Community = -1001234567890;
    private static readonly byte[] Ogg = "OggS\u0000voice"u8.ToArray();

    private readonly TestHost _host = new();
    private readonly StubOpenRouter _openRouter = new();

    public void Dispose() => _host.Dispose();

    private VoiceTranscriber Transcriber() =>
        new(_host.Db, _host.Chat, _openRouter.Client(), _host.Settings, TestHost.Config(),
            NullLogger<VoiceTranscriber>.Instance);

    private async Task<VoiceTranscription> QueuedAsync(int duration = 461, long statusMessageId = 77)
    {
        _host.Chat.Files["file-1"] = Ogg;
        var job = new VoiceTranscription
        {
            FileUniqueId = "AgADvoice1", FileId = "file-1", DurationSeconds = duration,
            ChatId = Community, VoiceMessageId = 50, StatusMessageId = statusMessageId,
            AuthorName = "Ержан", AuthorTgId = 555,
            Status = "pending", CreatedAt = DateTimeOffset.UtcNow, NextAttemptAt = DateTimeOffset.UtcNow,
        };
        _host.Db.VoiceTranscriptions.Add(job);
        await _host.Db.SaveChangesAsync();
        return job;
    }

    private const string Restructured = """
        # Реверс-инжиниринг Android-приложений

        ## Чем занимаюсь

        Для души периодически занимаюсь реверс-инжинирингом.
        """;

    [Fact]
    public async Task A_voice_becomes_a_markdown_paste_and_the_status_reply_becomes_its_link()
    {
        await QueuedAsync();
        _openRouter.Transcribes("А-а, ну для души, короче, реверс-инжинирингом занимаюсь.", cost: 0.0128m)
                   .Completes(Restructured, cost: 0.0025m);

        Assert.Equal(1, await Transcriber().ProcessDueAsync(CancellationToken.None));

        var db = _host.NewDbContext();
        var job = db.VoiceTranscriptions.Single();
        Assert.Equal("done", job.Status);
        Assert.Equal(0.0153m, job.CostUsd);

        var paste = db.Pastes.Single();
        Assert.Equal(job.PastePublicId, paste.PublicId);
        Assert.Equal("markdown", paste.Language);
        Assert.Equal("Ержан", paste.AuthorName);
        Assert.Equal(555, paste.AuthorTgId);
        Assert.StartsWith("# Реверс-инжиниринг Android-приложений\n\n*Расшифровка голосового, 7:41.", paste.Content);
        Assert.Contains("## Чем занимаюсь", paste.Content);
        Assert.True(paste.ExpiresAt > DateTimeOffset.UtcNow.AddDays(29));

        // The "расшифровываю" reply, edited in place into the link.
        var edit = _host.Chat.LastCall;
        Assert.Equal("editMessageText", edit.Method);
        Assert.Equal(Community, edit.ChatId);
        Assert.Equal(77, edit.MessageId);
        Assert.Contains($"https://teamleads.kz/p/{paste.PublicId}/", edit.Text);
        Assert.Contains("Ержан", edit.Text);
    }

    // What actually went to OpenRouter: the raw audio as a multipart upload with the
    // configured model, then the transcript with the prompt and reasoning off.
    [Fact]
    public async Task Both_calls_use_the_configured_models_and_the_key()
    {
        await QueuedAsync();
        await _host.SetSettingAsync("voice.stt_model", "openai/whisper-large-v3");
        await _host.SetSettingAsync("voice.llm_model", "deepseek/deepseek-v4-flash");
        _openRouter.Transcribes("Текст голосового сообщения.").Completes(Restructured);

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        var stt = _openRouter.Calls[0];
        Assert.Equal("/api/v1/audio/transcriptions", stt.Path);
        Assert.Equal("Bearer sk-or-test", stt.Authorization);
        Assert.Equal("multipart/form-data", stt.ContentType);
        Assert.Contains("name=model", stt.Body);
        Assert.Contains("openai/whisper-large-v3", stt.Body);
        Assert.Contains("filename=voice.oga", stt.Body);
        Assert.Contains("OggS", stt.Body);

        var llm = _openRouter.Calls[1];
        Assert.Equal("/api/v1/chat/completions", llm.Path);
        Assert.Equal("Bearer sk-or-test", llm.Authorization);
        using var body = System.Text.Json.JsonDocument.Parse(llm.Body);
        Assert.Equal("deepseek/deepseek-v4-flash", body.RootElement.GetProperty("model").GetString());
        Assert.False(body.RootElement.GetProperty("reasoning").GetProperty("enabled").GetBoolean());
        var messages = body.RootElement.GetProperty("messages");
        Assert.Equal(VoiceTranscriber.Prompt, messages[0].GetProperty("content").GetString());
        Assert.Equal("Текст голосового сообщения.", messages[1].GetProperty("content").GetString());
    }

    // The speech recognition was paid for; a failed edit must not throw that away.
    [Fact]
    public async Task When_restructuring_fails_the_raw_transcript_is_published_and_says_so()
    {
        await QueuedAsync();
        _openRouter.Transcribes("Сырой текст голосового.")
                   .Fails(HttpStatusCode.ServiceUnavailable, "No endpoints available")
                   .Fails(HttpStatusCode.ServiceUnavailable, "No endpoints available");

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        var paste = _host.NewDbContext().Pastes.Single();
        Assert.Contains("без редактуры", paste.Content);
        Assert.Contains("Сырой текст голосового.", paste.Content);
        Assert.Equal("done", _host.NewDbContext().VoiceTranscriptions.Single().Status);
        Assert.Contains("Редактура не удалась", _host.Chat.LastCall.Text);
    }

    // Seen live: one of the providers behind the model refused a valid request with
    // "text content parts must carry a string". A second ask is what saves the edit.
    [Fact]
    public async Task A_restructuring_refused_once_is_asked_again_before_falling_back()
    {
        await QueuedAsync();
        _openRouter.Transcribes("Сырой текст голосового.")
                   .Fails(HttpStatusCode.BadRequest, "text content parts must carry a string \"text\" (got null)")
                   .Completes(Restructured);

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        Assert.Equal(3, _openRouter.Calls.Count);
        var paste = _host.NewDbContext().Pastes.Single();
        Assert.Contains("## Чем занимаюсь", paste.Content);
        Assert.DoesNotContain("без редактуры", paste.Content);
    }

    // Half a document published as if it were the whole one is worse than the unedited
    // transcript, so a reply cut off at max_tokens counts as a failed edit.
    [Fact]
    public async Task A_restructured_reply_cut_off_at_the_token_limit_falls_back_to_the_raw_transcript()
    {
        await QueuedAsync();
        _openRouter.Transcribes("Сырой текст голосового.")
                   .Completes("# Начало документа\n\n## Раздел", finishReason: "length")
                   .Completes("# Начало документа\n\n## Раздел", finishReason: "length");

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        var paste = _host.NewDbContext().Pastes.Single();
        Assert.Contains("без редактуры", paste.Content);
        Assert.DoesNotContain("Начало документа", paste.Content);
    }

    [Fact]
    public async Task A_failed_recognition_is_retried_then_reported_in_the_chat()
    {
        var job = await QueuedAsync();
        _openRouter.Fails(HttpStatusCode.BadGateway, "upstream timeout")
                   .Fails(HttpStatusCode.BadGateway, "upstream timeout")
                   .Fails(HttpStatusCode.BadGateway, "upstream timeout");
        var transcriber = Transcriber();

        await transcriber.ProcessDueAsync(CancellationToken.None);
        Assert.Equal("pending", job.Status);
        Assert.Equal(1, job.Attempts);
        Assert.Contains("upstream timeout", job.LastError);
        Assert.True(job.NextAttemptAt > DateTimeOffset.UtcNow);
        Assert.DoesNotContain("editMessageText", _host.Chat.Methods);   // still waiting, nothing to say yet

        // The backoff has passed, twice.
        for (var i = 0; i < 2; i++)
        {
            job.NextAttemptAt = DateTimeOffset.UtcNow;
            await _host.Db.SaveChangesAsync();
            await transcriber.ProcessDueAsync(CancellationToken.None);
        }

        Assert.Equal("failed", job.Status);
        Assert.Equal(3, job.Attempts);
        Assert.Empty(_host.NewDbContext().Pastes);
        var answer = _host.Chat.LastCall;
        Assert.Equal("editMessageText", answer.Method);
        Assert.Contains("Не получилось", answer.Text);
    }

    // Silence, music, a pocket recording: nothing to transcribe, and retrying will not
    // change that.
    [Fact]
    public async Task A_voice_with_no_words_in_it_fails_at_once_without_a_retry()
    {
        var job = await QueuedAsync();
        _openRouter.Transcribes("");

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        Assert.Equal("failed", job.Status);
        Assert.Equal(1, job.Attempts);
        Assert.Single(_openRouter.Calls);   // the restructuring model was never asked
        Assert.Contains("ни слова", _host.Chat.LastCall.Text);
    }

    [Fact]
    public async Task A_download_failure_is_retried_without_calling_openrouter()
    {
        var job = await QueuedAsync();
        _host.Chat.Files.Clear();

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        Assert.Equal("pending", job.Status);
        Assert.Contains("скачивание", job.LastError);
        Assert.Empty(_openRouter.Calls);
    }

    // The status reply never landed, or the edit is refused (deleted, too old): the link
    // still reaches the chat, as a fresh reply under the voice with the preview on.
    [Theory]
    [InlineData(0L, false)]
    [InlineData(77L, true)]
    public async Task Without_a_status_reply_to_edit_the_link_is_sent_as_a_new_reply(long statusMessageId, bool editFails)
    {
        await QueuedAsync(statusMessageId: statusMessageId);
        _openRouter.Transcribes("Текст.").Completes(Restructured);
        if (editFails) _host.Chat.Fails("Bad Request: message to edit not found");

        await Transcriber().ProcessDueAsync(CancellationToken.None);

        var sent = _host.Chat.LastCall;
        Assert.Equal("sendMessage", sent.Method);
        Assert.Equal(50, sent.ReplyToMessageId);
        Assert.Equal(false, sent.DisablePreview);
        Assert.Contains("https://teamleads.kz/p/", sent.Text);
    }

    [Fact]
    public async Task A_job_cut_off_by_a_restart_runs_again()
    {
        var job = await QueuedAsync();
        job.Status = "running";
        job.Attempts = 1;
        await _host.Db.SaveChangesAsync();

        Assert.Equal(1, await Transcriber().RequeueInterruptedAsync(CancellationToken.None));

        var requeued = _host.NewDbContext().VoiceTranscriptions.Single();
        Assert.Equal("pending", requeued.Status);
        Assert.Equal(1, requeued.Attempts);
    }

    [Fact]
    public async Task Jobs_waiting_on_their_backoff_are_left_alone()
    {
        var job = await QueuedAsync();
        job.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(3);
        await _host.Db.SaveChangesAsync();

        Assert.Equal(0, await Transcriber().ProcessDueAsync(CancellationToken.None));
        Assert.Empty(_openRouter.Calls);
    }

    // ── the document around the model's answer ─────────────────────────────

    [Fact]
    public void The_note_goes_under_the_models_title()
    {
        var doc = VoiceTranscriber.Document("# Тема\n\n## Раздел\n\nТекст.", 75);

        Assert.Equal("# Тема\n\n*Расшифровка голосового, 1:15. Текст отредактирован нейросетью: убраны слова-паразиты и повторы, добавлены разделы.*\n\n## Раздел\n\nТекст.\n", doc);
    }

    [Fact]
    public void A_missing_title_gets_a_generic_one()
    {
        var doc = VoiceTranscriber.Document("Просто текст без заголовка.", 30);

        Assert.StartsWith("# Голосовое сообщение\n\n*Расшифровка голосового, 0:30.", doc);
        Assert.EndsWith("Просто текст без заголовка.\n", doc);
    }

    [Fact]
    public void A_fence_around_the_whole_answer_is_taken_off()
    {
        var doc = VoiceTranscriber.Document("```markdown\n# Тема\n\nТекст.\n```", 10);

        Assert.StartsWith("# Тема\n\n", doc);
        Assert.DoesNotContain("```", doc);
    }

    [Fact]
    public async Task Without_a_key_nothing_is_sent_to_openrouter()
    {
        var outcome = await _openRouter.Client(apiKey: null)
            .TranscribeAsync(Ogg, "voice.oga", "microsoft/mai-transcribe-2", CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Empty(_openRouter.Calls);
    }
}
