using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// What the moderation flow asks Telegram for.
//
// TelegramClientWireTests pins what each Bot API method puts on the wire. This file pins
// the calls a swap has to keep producing: which method, to which chat, in which order,
// and – the part that is easy to lose – which calls must NOT happen. A client that turns
// a refused publish into a silent success still passes every wire test and quietly loses
// the "⚠️ Ошибка публикации" card the admin is waiting on.
public class AnonServiceTelegramTests
{
    private const long Community = -1001234567890;
    private const long Admin = -100777;

    private static async Task<TestHost> HostAsync(bool community = true, bool admin = true)
    {
        var host = new TestHost();
        if (community) await host.SetSettingAsync("tg.community_chat_id", Community.ToString());
        if (admin) await host.SetSettingAsync("tg.admin_chat_id", Admin.ToString());
        return host;
    }

    // A request already carrying its moderation card, which is the state every decision
    // starts from – the card itself is queued through the outbox, not sent from here.
    private static async Task<AnonRequest> PendingAsync(TestHost host, string text = "Как отпустить микроменеджмент?",
        string? editedText = null, long? adminMessageId = 4242, string status = "pending")
    {
        var row = new AnonRequest
        {
            PublicId = "A7F3K2",
            Text = text,
            EditedText = editedText,
            Source = "bot",
            Status = status,
            AdminMessageId = adminMessageId,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        host.Db.AnonRequests.Add(row);
        await host.Db.SaveChangesAsync();
        return row;
    }

    // ── creating ────────────────────────────────────────────────────────────

    // The submitter's HTTP request must not wait on Telegram, and a card must survive an
    // outage, a rate limit, or a bot token that is not configured yet. Both properties
    // come from the same fact: creating a request talks to the outbox, never to Telegram.
    [Fact]
    public async Task Creating_a_request_sends_nothing_and_queues_the_card_instead()
    {
        using var host = await HostAsync();

        await host.Anon().CreateAsync("Как отпустить микроменеджмент, не потеряв контроль?", "form", null, default);

        Assert.Empty(host.Api.Calls);
        var queued = Assert.Single(host.Db.Outbox);
        Assert.Equal("anon_card", queued.Kind);
        // Destination resolved at send time, so a card queued while the setting is wrong
        // still lands once it is corrected.
        Assert.Equal("tg.admin_chat_id", queued.ChatSetting);
        Assert.Contains($"anon:pub:{queued.RelatedKey}", queued.ReplyMarkupJson);
    }

    // ── publishing ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Publishing_sends_the_question_to_the_community_chat_then_settles_the_card()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);
        host.Api.RespondsOk(messageId: 9001);   // sendMessage
        host.Api.RespondsOk();                  // editMessageText

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Equal("Опубликовано.", answer);
        Assert.Equal(2, host.Api.Calls.Count);

        // Order matters: publish first, settle after. A card marked published on top of a
        // send that never happened is the one failure the admin cannot see.
        var publish = host.Api.Calls[0];
        Assert.Equal("sendMessage", publish.Method);
        Assert.Equal(Community, publish.Long("chat_id"));
        Assert.Contains("Как отпустить микроменеджмент?", publish.String("text"));
        // Same rule as everywhere else: the text is a stranger's, so it is never markup.
        Assert.False(publish.Has("parse_mode"));
        // The published question carries no keyboard – the buttons belong to the card.
        Assert.False(publish.Has("reply_markup"));

        var settle = host.Api.Calls[1];
        Assert.Equal("editMessageText", settle.Method);
        Assert.Equal(Admin, settle.Long("chat_id"));
        Assert.Equal(4242, settle.Long("message_id"));
        Assert.Contains("✅ Опубликовано", settle.String("text"));
        // A deep link to the published message: -100 dropped, as t.me/c/ wants it.
        Assert.Contains($"https://t.me/c/1234567890/9001", settle.String("text"));
        // Buttons gone: the decision is made, and a second tap must not be offered.
        Assert.False(settle.Has("reply_markup"));
    }

    [Fact]
    public async Task Publishing_records_the_message_id_the_client_reported()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);
        host.Api.RespondsOk(messageId: 9001);

        await host.Anon().PublishAsync(row, byTgId: 555, default);

        using var db = host.NewDbContext();
        var stored = db.AnonRequests.Single();
        Assert.Equal("published", stored.Status);
        // Read back off the id the client parsed out of Telegram's `result`. A client that
        // reports 0 leaves the archive unable to link to what it published.
        Assert.Equal(9001, stored.PublishedMessageId);
        Assert.Equal(555, stored.ModeratedByTgId);
        Assert.NotNull(stored.ModeratedAt);
    }

    [Fact]
    public async Task The_admins_edit_is_what_reaches_the_chat()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host, text: "исходный текст с деталями", editedText: "обезличенный текст");

        await host.Anon().PublishAsync(row, byTgId: 555, default);

        var publish = host.Api.Calls[0];
        Assert.Contains("обезличенный текст", publish.String("text"));
        // The whole point of the edit is stripping identifying details. Publishing the
        // original alongside it would defeat it.
        Assert.DoesNotContain("исходный текст", publish.String("text"));
    }

    // A refused publish keeps the request alive with its buttons, so the admin can fix
    // the cause and tap again. Telegram's own words go on the card: "chat not found" and
    // "bot was kicked" need different fixes.
    [Fact]
    public async Task A_refused_publish_leaves_the_request_pending_with_live_buttons()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);
        host.Api.RespondsError("Forbidden: bot was kicked from the supergroup chat");

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Contains("bot was kicked", answer);

        var card = host.Api.Calls[1];
        Assert.Equal("editMessageText", card.Method);
        Assert.Contains("⚠️ Ошибка публикации", card.String("text"));
        Assert.Contains("bot was kicked", card.String("text"));
        Assert.True(card.Has("reply_markup"));   // retry has to stay one tap away

        using var db = host.NewDbContext();
        var stored = db.AnonRequests.Single();
        Assert.Equal("pending", stored.Status);
        Assert.Null(stored.PublishedMessageId);
    }

    // A transport failure is not a decision either. Same outcome as a refusal – the
    // difference only shows up in the text on the card.
    [Fact]
    public async Task A_dead_socket_leaves_the_request_pending_too()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);
        host.Api.Throws(new HttpRequestException("Connection reset by peer"));

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Contains("Не отправилось", answer);
        Assert.Equal("pending", host.NewDbContext().AnonRequests.Single().Status);
    }

    [Fact]
    public async Task Nothing_is_sent_when_the_community_chat_is_not_configured()
    {
        using var host = await HostAsync(community: false);
        var row = await PendingAsync(host);

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Equal("Не задан tg.community_chat_id.", answer);
        // Not even the card update: there is nothing to report yet, and 0 is not a chat.
        Assert.Empty(host.Api.Calls);
    }

    // Telegram delivers a double tap as two updates, and an admin who does not see the
    // spinner stop taps again. The second one must not post the question twice.
    [Theory]
    [InlineData("published")]
    [InlineData("rejected")]
    public async Task A_second_tap_on_a_decided_request_calls_nothing(string status)
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host, status: status);
        var anon = host.Anon();

        Assert.StartsWith("Уже ", await anon.PublishAsync(row, 555, default));
        Assert.StartsWith("Уже ", await anon.RejectAsync(row, 555, default));

        Assert.Empty(host.Api.Calls);
    }

    // ── rejecting and editing ───────────────────────────────────────────────

    [Fact]
    public async Task Rejecting_only_touches_the_card_and_never_the_community_chat()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);

        var answer = await host.Anon().RejectAsync(row, byTgId: 555, default);

        Assert.Equal("Отклонено.", answer);
        var call = Assert.Single(host.Api.Calls);
        Assert.Equal("editMessageText", call.Method);
        Assert.Equal(Admin, call.Long("chat_id"));
        Assert.Contains("🚫 Отклонено", call.String("text"));
        Assert.False(call.Has("reply_markup"));
    }

    [Fact]
    public async Task An_applied_edit_redraws_the_card_with_the_buttons_still_live()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);

        await host.Anon().ApplyEditAsync(row, "  обезличенная версия  ", default);

        var call = Assert.Single(host.Api.Calls);
        Assert.Equal("editMessageText", call.Method);
        Assert.Contains("обезличенная версия", call.String("text"));
        Assert.Contains("(текст отредактирован админом)", call.String("text"));
        // Still pending, so the three buttons have to come back – an edit is not a decision.
        var buttons = call.Json.GetProperty("reply_markup").GetProperty("inline_keyboard")[0];
        Assert.Equal(3, buttons.GetArrayLength());
        Assert.Equal("anon:pub:A7F3K2", buttons[0].GetProperty("callback_data").GetString());
    }

    // ── the card that is not there yet ──────────────────────────────────────

    // A decision can land before the outbox has delivered the card (the admin acts on a
    // card queued from an earlier boot, or the chat id was fixed only just now). There is
    // no message to edit, and asking Telegram to edit message 0 fails loudly for nothing.
    [Fact]
    public async Task A_decision_on_an_undelivered_card_publishes_and_skips_the_edit()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host, adminMessageId: null);

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Equal("Опубликовано.", answer);
        var call = Assert.Single(host.Api.Calls);
        Assert.Equal("sendMessage", call.Method);
    }

    [Fact]
    public async Task The_card_is_left_alone_when_the_admin_chat_is_not_configured()
    {
        using var host = await HostAsync(admin: false);
        var row = await PendingAsync(host);

        await host.Anon().PublishAsync(row, byTgId: 555, default);

        // Published anyway – the question is the deliverable, the card is the receipt.
        var call = Assert.Single(host.Api.Calls);
        Assert.Equal("sendMessage", call.Method);
        Assert.Equal(Community, call.Long("chat_id"));
    }

    // The card edit is best-effort: it is a receipt for a decision that is already
    // recorded. A client that throws here instead of returning a failed Result would
    // turn a cosmetic problem into a lost publish.
    [Fact]
    public async Task A_failing_card_edit_does_not_undo_the_publish()
    {
        using var host = await HostAsync();
        var row = await PendingAsync(host);
        host.Api.RespondsOk(messageId: 9001);                              // sendMessage
        host.Api.RespondsError("Bad Request: message to edit not found");  // editMessageText

        var answer = await host.Anon().PublishAsync(row, byTgId: 555, default);

        Assert.Equal("Опубликовано.", answer);
        var stored = host.NewDbContext().AnonRequests.Single();
        Assert.Equal("published", stored.Status);
        Assert.Equal(9001, stored.PublishedMessageId);
    }
}
