using System.Text.Json;
using System.Text.Json.Serialization;
using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// /paste in reply to a voice message, up to the point where the worker takes over.
//
// Everything here happens inside the webhook's few seconds: the gates (feature on,
// allowed chat, member in a DM), the dedupe on file_unique_id, the limits, and the job
// row plus the "расшифровываю" reply. Nothing in this file reaches OpenRouter – that is
// the point of the split, and VoiceTranscriberTests covers the other side.
public class VoicePasteWebhookTests
{
    private const long Community = -1001234567890;
    private const long OtherGroup = -1009999999999;
    private const long Dm = 424242;

    private static async Task<WebhookHost> StartAsync(bool enabled = true, string chats = "-1001234567890")
    {
        var host = new TestHost();
        await host.SetSettingAsync("tg.admin_chat_id", "-100777");
        await host.SetSettingAsync("voice.enabled", enabled ? "true" : "false");
        await host.SetSettingAsync("voice.chats", chats);
        return await WebhookHost.StartAsync(host);
    }

    private static readonly JsonSerializerOptions Json =
        new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static object VoiceMessage(long chatId, string chatType, int duration = 461, long? fileSize = 9_486_348,
        string uniqueId = "AgADvoice1", long messageId = 50) => new
        {
            message_id = messageId,
            chat = new { id = chatId, type = chatType },
            from = new { id = 555L, first_name = "Ержан" },
            voice = new { file_id = "AwACAgIAAxkB-file", file_unique_id = uniqueId, duration, file_size = fileSize, mime_type = "audio/ogg" },
        };

    // "/paste" typed by user 999 in reply to a voice recorded by user 555.
    private static string PasteOnVoice(long chatId = Community, string chatType = "supergroup", string text = "/paste",
        object? voice = null) =>
        JsonSerializer.Serialize(new
        {
            message = new
            {
                message_id = 100,
                chat = new { id = chatId, type = chatType },
                from = new { id = 999L, first_name = "Айгуль" },
                text,
                reply_to_message = voice ?? VoiceMessage(chatId, chatType),
            },
        }, Json);

    [Fact]
    public async Task A_voice_in_an_allowed_chat_is_queued_and_acknowledged_under_the_voice()
    {
        await using var web = await StartAsync();

        Assert.Equal(200, await web.PostAsync(PasteOnVoice()));

        var job = web.Host.NewDbContext().VoiceTranscriptions.Single();
        Assert.Equal("pending", job.Status);
        Assert.Equal("AgADvoice1", job.FileUniqueId);
        Assert.Equal("AwACAgIAAxkB-file", job.FileId);
        Assert.Equal(461, job.DurationSeconds);
        Assert.Equal(Community, job.ChatId);
        Assert.Equal(50, job.VoiceMessageId);
        // Attributed to whoever spoke, not whoever typed /paste.
        Assert.Equal(555, job.AuthorTgId);
        Assert.Equal("Ержан", job.AuthorName);

        var ack = web.Host.Chat.LastCall;
        Assert.Equal("sendMessage", ack.Method);
        Assert.Equal(50, ack.ReplyToMessageId);
        Assert.Contains("Расшифровываю", ack.Text);
        Assert.Contains("7:41", ack.Text);
        // The worker edits this message into the link, so its id must be on the job.
        Assert.NotEqual(0, job.StatusMessageId);
    }

    [Fact]
    public async Task Nothing_is_queued_while_the_feature_is_off()
    {
        await using var web = await StartAsync(enabled: false);

        await web.PostAsync(PasteOnVoice());

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("выключена", web.Host.Chat.LastCall.Text);
        Assert.Equal(100, web.Host.Chat.LastCall.ReplyToMessageId);
    }

    [Fact]
    public async Task A_group_that_is_not_on_the_list_is_refused()
    {
        await using var web = await StartAsync();

        await web.PostAsync(PasteOnVoice(chatId: OtherGroup));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("не включена", web.Host.Chat.LastCall.Text);
    }

    // The limit is checked before anything is downloaded – the answer comes now, from the
    // voice's own duration, not from a worker that already promised a link.
    [Fact]
    public async Task A_voice_over_the_limit_is_refused_with_its_length()
    {
        await using var web = await StartAsync();

        await web.PostAsync(PasteOnVoice(voice: VoiceMessage(Community, "supergroup", duration: 15 * 60 + 1)));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("15:01", web.Host.Chat.LastCall.Text);
        Assert.Contains("15 мин", web.Host.Chat.LastCall.Text);
    }

    [Fact]
    public async Task A_file_over_telegrams_download_cap_is_refused()
    {
        await using var web = await StartAsync();

        await web.PostAsync(PasteOnVoice(voice: VoiceMessage(Community, "supergroup", fileSize: 21L * 1024 * 1024)));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("20 МБ", web.Host.Chat.LastCall.Text);
    }

    [Fact]
    public async Task An_already_transcribed_voice_gets_its_existing_link_and_costs_nothing()
    {
        await using var web = await StartAsync();
        var db = web.Host.NewDbContext();
        db.Pastes.Add(new Paste { PublicId = "VOICE01", Content = "# x", Language = "markdown", Source = "bot",
            CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(10) });
        db.VoiceTranscriptions.Add(new VoiceTranscription { FileUniqueId = "AgADvoice1", FileId = "old", AuthorName = "Ержан",
            Status = "done", PastePublicId = "VOICE01" });
        await db.SaveChangesAsync();

        // Forwarded into a DM elsewhere it would carry the same file_unique_id; here it is
        // simply asked for a second time.
        await web.PostAsync(PasteOnVoice());

        var jobs = web.Host.NewDbContext().VoiceTranscriptions.ToList();
        Assert.Single(jobs);
        Assert.Equal("done", jobs[0].Status);
        Assert.Contains("https://teamleads.kz/p/VOICE01/", web.Host.Chat.LastCall.Text);
        Assert.Equal(false, web.Host.Chat.LastCall.DisablePreview);
    }

    [Fact]
    public async Task A_voice_already_in_progress_is_not_queued_twice()
    {
        await using var web = await StartAsync();

        await web.PostAsync(PasteOnVoice());
        await web.PostAsync(PasteOnVoice());

        Assert.Single(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("уже расшифровываю", web.Host.Chat.LastCall.Text);
    }

    // A failed job is not a dead end: asking again starts it over, in the same row.
    [Fact]
    public async Task A_failed_voice_is_retried_when_asked_again()
    {
        await using var web = await StartAsync();
        var db = web.Host.NewDbContext();
        db.VoiceTranscriptions.Add(new VoiceTranscription { FileUniqueId = "AgADvoice1", FileId = "old", AuthorName = "Ержан",
            Status = "failed", Attempts = 3, LastError = "распознавание: timeout" });
        await db.SaveChangesAsync();

        await web.PostAsync(PasteOnVoice());

        var job = web.Host.NewDbContext().VoiceTranscriptions.Single();
        Assert.Equal("pending", job.Status);
        Assert.Equal(0, job.Attempts);
        Assert.Null(job.LastError);
        Assert.Equal("AwACAgIAAxkB-file", job.FileId);
    }

    [Fact]
    public async Task In_a_dm_a_member_of_a_voice_chat_is_served()
    {
        await using var web = await StartAsync();
        web.Api.RespondsOk(rawResult: """{"status":"member","user":{"id":999}}""");

        await web.PostAsync(PasteOnVoice(chatId: Dm, chatType: "private", voice: VoiceMessage(Dm, "private")));

        var check = web.Api.Calls.Single(c => c.Method == "getChatMember");
        Assert.Equal(Community, check.Long("chat_id"));
        // The person who asked, not the person who recorded it – that one may be anyone.
        Assert.Equal(999, check.Long("user_id"));
        Assert.Single(web.Host.NewDbContext().VoiceTranscriptions);
    }

    [Theory]
    [InlineData("""{"status":"left","user":{"id":999}}""")]
    [InlineData("""{"status":"restricted","is_member":false,"user":{"id":999}}""")]
    public async Task In_a_dm_someone_outside_the_voice_chats_is_refused(string member)
    {
        await using var web = await StartAsync();
        web.Api.RespondsOk(rawResult: member);

        await web.PostAsync(PasteOnVoice(chatId: Dm, chatType: "private", voice: VoiceMessage(Dm, "private")));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("участникам", web.Host.Chat.LastCall.Text);
    }

    // The check cannot be made (the bot is not in that chat, Telegram is down): an
    // allowlist that cannot be read must not open up.
    [Fact]
    public async Task In_a_dm_a_membership_check_that_fails_counts_as_no()
    {
        await using var web = await StartAsync();
        web.Api.RespondsError("Bad Request: chat not found");

        await web.PostAsync(PasteOnVoice(chatId: Dm, chatType: "private", voice: VoiceMessage(Dm, "private")));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
    }

    [Fact]
    public async Task A_bare_voice_in_a_dm_is_answered_with_how_to_transcribe_it()
    {
        await using var web = await StartAsync();

        await web.PostAsync(JsonSerializer.Serialize(new { message = VoiceMessage(Dm, "private") }, Json));

        Assert.Contains("ответьте на него командой /paste", web.Host.Chat.LastCall.Text);
        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
    }

    // The bot is an admin in the community chat and sees every voice there. Answering each
    // one would be noise, so outside a DM a voice without a command stays unanswered.
    [Fact]
    public async Task A_bare_voice_in_the_community_chat_is_left_alone()
    {
        await using var web = await StartAsync();

        await web.PostAsync(JsonSerializer.Serialize(new { message = VoiceMessage(Community, "supergroup") }, Json));

        Assert.Empty(web.Host.Chat.Calls);
    }

    // "/paste <текст>" means that text, whatever the command replies to.
    [Fact]
    public async Task Inline_text_still_wins_over_the_voice_it_replies_to()
    {
        await using var web = await StartAsync();

        await web.PostAsync(PasteOnVoice(text: "/paste SELECT * FROM outbox WHERE status = 'pending';"));

        Assert.Empty(web.Host.NewDbContext().VoiceTranscriptions);
        Assert.Contains("SELECT", web.Host.NewDbContext().Pastes.Single().Content);
    }
}
