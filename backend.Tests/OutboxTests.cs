using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// The drain loop, which is what PR #12 rewrites.
//
// Outbox exists because a lost message is invisible: anon request ZCBFQR reached the
// database and never reached an admin. Every assertion here is about that promise –
// a message is either delivered, deliberately expired, or still queued with a reason.
public class OutboxTests
{
    private const string AdminChat = "tg.admin_chat_id";

    // Mirrors the private Backoff table in Outbox. Duplicated on purpose: if someone
    // changes the schedule, this test should force them to notice.
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromSeconds(30),
        TimeSpan.FromMinutes(2),
        TimeSpan.FromMinutes(10),
        TimeSpan.FromHours(1),
        TimeSpan.FromHours(6),
    ];

    // ---- happy path --------------------------------------------------------------

    [Fact]
    public async Task Delivers_a_due_message_and_marks_it_sent()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", chatId: -100500, text: "готово");
        host.Chat.Delivers(4242);

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(1, sent);
        var row = await host.Db.Outbox.SingleAsync();
        Assert.Equal("sent", row.Status);
        Assert.Equal(1, row.Attempts);
        Assert.NotNull(row.SentAt);
        Assert.Null(row.LastError);
        Assert.Equal(-100500, host.Chat.Last.ChatId);
        Assert.Equal("готово", host.Chat.Last.Text);
    }

    [Fact]
    public async Task Enqueue_makes_a_message_due_immediately()
    {
        using var host = new TestHost();

        var row = await host.NewOutbox().EnqueueAsync("notice", 1, "hi");

        Assert.Equal("pending", row.Status);
        Assert.Equal(0, row.Attempts);
        Assert.Equal(row.CreatedAt, row.NextAttemptAt);   // first try on the next tick
        Assert.Null(row.ExpiresAt);                       // no TTL unless asked for
    }

    [Fact]
    public async Task A_sent_message_is_not_sent_again_on_the_next_tick()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "hi");

        await outbox.DispatchDueAsync(CancellationToken.None);
        var second = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, second);
        Assert.Single(host.Chat.Sent);   // a duplicate in the community chat is worse than a delay
    }

    [Fact]
    public async Task A_message_scheduled_for_later_is_left_alone()
    {
        using var host = new TestHost();
        host.Db.Outbox.Add(Pending(chatId: 1, nextAttempt: DateTimeOffset.UtcNow.AddMinutes(5)));
        await host.Db.SaveChangesAsync();

        var sent = await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, sent);
        Assert.Empty(host.Chat.Sent);
    }

    // ---- retry + backoff ---------------------------------------------------------

    [Fact]
    public async Task A_failed_send_stays_pending_and_records_why()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 1, "карточка");
        host.Chat.Fails("Bad Request: chat not found");

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, sent);
        var row = await host.Db.Outbox.SingleAsync();
        Assert.Equal("pending", row.Status);
        Assert.Equal(1, row.Attempts);
        Assert.Equal("Bad Request: chat not found", row.LastError);
        Assert.Null(row.SentAt);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public async Task Each_failure_pushes_the_next_attempt_out_by_the_scheduled_backoff(int attemptsSoFar)
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.Attempts = attemptsSoFar - 1;
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();
        host.Chat.Fails("Too Many Requests");

        var before = DateTimeOffset.UtcNow;
        await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        var expected = before + Backoff[attemptsSoFar - 1];
        Assert.Equal("pending", row.Status);
        Assert.Equal(attemptsSoFar, row.Attempts);
        // Loose bound: the wall clock moves between the read and the assertion.
        Assert.InRange(row.NextAttemptAt, expected, expected.AddSeconds(30));
    }

    [Fact]
    public async Task Gives_up_after_the_last_backoff_step()
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.Attempts = Backoff.Length - 1;   // this send is the last one
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();
        host.Chat.Fails("Forbidden: bot was blocked by the user");

        await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Equal("failed", row.Status);
        Assert.Equal(Backoff.Length, row.Attempts);
        Assert.Equal("Forbidden: bot was blocked by the user", row.LastError);
    }

    [Fact]
    public async Task A_failed_message_is_never_retried()
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.Status = "failed";
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();

        await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Empty(host.Chat.Sent);
    }

    [Fact]
    public async Task A_send_that_succeeds_after_earlier_failures_clears_the_error()
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.Attempts = 2;
        row.LastError = "Bad Gateway";
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();
        host.Chat.Delivers(9);

        await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Equal("sent", row.Status);
        Assert.Equal(3, row.Attempts);
        Assert.Null(row.LastError);   // a stale error next to status=sent reads as a bug
    }

    // A dead socket, a rate limit and a bot kicked from the chat all arrive here as the
    // same thing: a failed outcome carrying a reason. Turning a client's exception into
    // one is the adapter's job – see ChatSenderContractTests.
    [Fact]
    public async Task A_transport_failure_is_retryable_not_a_crash()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "hi");
        host.Chat.Fails("Connection reset by peer");

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, sent);
        var row = await host.Db.Outbox.SingleAsync();
        Assert.Equal("pending", row.Status);
        Assert.Equal(1, row.Attempts);
        Assert.NotNull(row.LastError);   // a failure with no reason is undebuggable
    }

    [Fact]
    public async Task One_dead_message_does_not_block_the_rest_of_the_batch()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "первое");
        await outbox.EnqueueAsync("notice", 2, "второе");
        host.Chat.Fails("chat not found").Delivers(7);

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(1, sent);
        var rows = await host.Db.Outbox.OrderBy(m => m.Id).ToListAsync();
        Assert.Equal("pending", rows[0].Status);
        Assert.Equal("sent", rows[1].Status);
    }

    // ---- expiry ------------------------------------------------------------------

    [Fact]
    public async Task An_expired_message_is_dropped_without_being_sent()
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();

        var sent = await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, sent);
        Assert.Equal("expired", row.Status);
        Assert.Equal(0, row.Attempts);   // never attempted, so it must not look like a failure
        Assert.Empty(host.Chat.Sent);
    }

    [Fact]
    public async Task A_message_without_a_ttl_never_expires()
    {
        using var host = new TestHost();
        var row = Pending(chatId: 1);
        row.CreatedAt = DateTimeOffset.UtcNow.AddDays(-30);
        row.ExpiresAt = null;
        host.Db.Outbox.Add(row);
        await host.Db.SaveChangesAsync();

        // A moderation card from last week is still useful; only messages that opted
        // into a TTL go stale.
        Assert.Equal(1, await host.NewOutbox().DispatchDueAsync(CancellationToken.None));
        Assert.Equal("sent", row.Status);
    }

    [Fact]
    public async Task Enqueue_with_a_ttl_sets_the_expiry_relative_to_now()
    {
        using var host = new TestHost();

        var row = await host.NewOutbox().EnqueueAsync("notice", 1, "hi", expiresIn: TimeSpan.FromHours(2));

        Assert.NotNull(row.ExpiresAt);
        Assert.InRange(row.ExpiresAt.Value, row.CreatedAt.AddHours(2).AddSeconds(-5), row.CreatedAt.AddHours(2).AddSeconds(5));
    }

    // ---- late destination resolution ---------------------------------------------

    [Fact]
    public async Task A_chat_setting_is_resolved_at_send_time_not_at_enqueue_time()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await host.SetSettingAsync(AdminChat, "-100111");
        await outbox.EnqueueAsync("anon_card", chatId: 0, text: "карточка", chatSetting: AdminChat);

        // The admin group is recreated between enqueue and send – the backlog must follow.
        await host.SetSettingAsync(AdminChat, "-100222");
        await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(-100222, host.Chat.Last.ChatId);
    }

    [Fact]
    public async Task An_unset_chat_setting_leaves_the_message_queued_without_burning_an_attempt()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", chatId: 0, text: "карточка", chatSetting: AdminChat);

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(0, sent);
        var row = await host.Db.Outbox.SingleAsync();
        Assert.Equal("pending", row.Status);
        // The bot was simply not configured yet. Counting this as an attempt would let a
        // misconfigured deploy exhaust the retry budget and lose the message for good.
        Assert.Equal(0, row.Attempts);
        Assert.Empty(host.Chat.Sent);
    }

    [Fact]
    public async Task A_backlog_queued_while_unconfigured_flushes_once_the_setting_arrives()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 0, "первая", chatSetting: AdminChat);
        await outbox.EnqueueAsync("anon_card", 0, "вторая", chatSetting: AdminChat);
        await outbox.DispatchDueAsync(CancellationToken.None);   // nothing goes out

        await host.SetSettingAsync(AdminChat, "-100777");
        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(2, sent);
        Assert.All(await host.Db.Outbox.ToListAsync(), r => Assert.Equal("sent", r.Status));
    }

    [Fact]
    public async Task A_literal_chat_id_is_used_as_is()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await host.SetSettingAsync(AdminChat, "-100999");
        await outbox.EnqueueAsync("notice", chatId: -100123, text: "hi");   // no chatSetting

        await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Equal(-100123, host.Chat.Last.ChatId);
    }

    // ---- reply markup round-trip -------------------------------------------------

    [Fact]
    public async Task An_inline_keyboard_survives_the_queue_intact()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        var keyboard = new
        {
            inline_keyboard = new[]
            {
                new[]
                {
                    new { text = "Опубликовать", callback_data = "anon:pub:A7F3K2" },
                    new { text = "Отклонить", callback_data = "anon:rej:A7F3K2" },
                },
            },
        };
        await outbox.EnqueueAsync("anon_card", 1, "карточка", keyboard);

        await outbox.DispatchDueAsync(CancellationToken.None);

        // Serialized at enqueue, stored in a column, handed to the adapter unchanged.
        // Whether it reaches the wire as a JSON object rather than a string is the
        // adapter's promise, checked in ChatSenderContractTests.
        Assert.NotNull(host.Chat.Last.ReplyMarkupJson);
        var markup = JsonDocument.Parse(host.Chat.Last.ReplyMarkupJson!).RootElement;
        Assert.Equal(JsonValueKind.Object, markup.ValueKind);
        var buttons = markup.GetProperty("inline_keyboard")[0];
        Assert.Equal(2, buttons.GetArrayLength());
        Assert.Equal("Опубликовать", buttons[0].GetProperty("text").GetString());
        Assert.Equal("anon:rej:A7F3K2", buttons[1].GetProperty("callback_data").GetString());
    }

    // The loop's half of the promise: it asks for previews off on every message. Whether
    // an adapter can actually deliver that is checked by
    // ChatSenderContractTests.Preview_suppression_is_honoured – and Telebot 0.0.5 cannot,
    // because its SendMessageRequestParams has no preview field at all. That is precisely
    // the split this port buys: the requirement is stated once here, and each client is
    // measured against it separately.
    [Fact]
    public async Task Every_message_asks_for_previews_to_be_suppressed()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 1, "вопрос со ссылкой https://example.com\n\nteamleads.kz/anon");

        await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.True(host.Chat.Last.DisablePreview);
    }

    [Fact]
    public async Task No_keyboard_means_nothing_is_handed_to_the_adapter()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "hi");

        await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Null(host.Chat.Last.ReplyMarkupJson);
    }

    // ---- write-back --------------------------------------------------------------

    [Fact]
    public async Task Delivering_an_anon_card_writes_the_message_id_back_to_the_request()
    {
        using var host = new TestHost();
        host.Db.AnonRequests.Add(new AnonRequest
        {
            PublicId = "A7F3K2", Text = "вопрос", Source = "form", Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await host.Db.SaveChangesAsync();

        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 1, "карточка", relatedKind: "anon", relatedKey: "A7F3K2");
        host.Chat.Delivers(555);
        await outbox.DispatchDueAsync(CancellationToken.None);

        // Without this the moderation card can never be edited in place after a decision.
        var anon = await host.Db.AnonRequests.SingleAsync();
        Assert.Equal(555, anon.AdminMessageId);
    }

    [Fact]
    public async Task A_failed_anon_card_does_not_write_back()
    {
        using var host = new TestHost();
        host.Db.AnonRequests.Add(new AnonRequest
        {
            PublicId = "A7F3K2", Text = "вопрос", Source = "form", Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await host.Db.SaveChangesAsync();

        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 1, "карточка", relatedKind: "anon", relatedKey: "A7F3K2");
        host.Chat.Fails("chat not found");
        await outbox.DispatchDueAsync(CancellationToken.None);

        Assert.Null((await host.Db.AnonRequests.SingleAsync()).AdminMessageId);
    }

    [Fact]
    public async Task An_unrelated_message_kind_writes_nothing_back()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("dilemma_reveal", 1, "итоги", relatedKind: "dilemma", relatedKey: "week-1");
        host.Chat.Delivers(12);

        await outbox.DispatchDueAsync(CancellationToken.None);   // must not throw looking for an anon row

        Assert.Equal("sent", (await host.Db.Outbox.SingleAsync()).Status);
    }

    [Fact]
    public async Task A_missing_related_row_does_not_fail_the_delivery()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("anon_card", 1, "карточка", relatedKind: "anon", relatedKey: "GONE01");
        host.Chat.Delivers(9);

        var sent = await outbox.DispatchDueAsync(CancellationToken.None);

        // The message did reach the chat. Rolling the row back because the write-back
        // target vanished would mean sending it a second time.
        Assert.Equal(1, sent);
        Assert.Equal("sent", (await host.Db.Outbox.SingleAsync()).Status);
    }

    // ---- batching ----------------------------------------------------------------

    [Fact]
    public async Task A_backlog_drains_twenty_at_a_time_oldest_first()
    {
        using var host = new TestHost();
        var oldest = DateTimeOffset.UtcNow.AddHours(-1);
        for (var i = 0; i < 25; i++)
            host.Db.Outbox.Add(Pending(chatId: 1, nextAttempt: oldest.AddMinutes(i), text: $"msg-{i:00}"));
        await host.Db.SaveChangesAsync();

        var first = await host.NewOutbox().DispatchDueAsync(CancellationToken.None);

        Assert.Equal(20, first);
        Assert.Equal(20, host.Chat.Sent.Count);
        // Oldest first, so a backlog cannot starve the message that has waited longest.
        Assert.Equal("msg-00", host.Chat.Sent[0].Text);
        Assert.Equal("msg-19", host.Chat.Sent[19].Text);

        var second = await host.NewOutbox().DispatchDueAsync(CancellationToken.None);
        Assert.Equal(5, second);
    }

    [Fact]
    public async Task An_empty_queue_is_a_no_op()
    {
        using var host = new TestHost();

        Assert.Equal(0, await host.NewOutbox().DispatchDueAsync(CancellationToken.None));
        Assert.Empty(host.Chat.Sent);
    }

    // ---- cancellation ------------------------------------------------------------

    [Fact]
    public async Task An_already_cancelled_tick_does_nothing_at_all()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "hi");
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        // The due-query is the first thing that observes the token, so shutdown between
        // ticks costs nothing. OutboxDispatcher catches this and breaks its loop.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => outbox.DispatchDueAsync(cts.Token));
        Assert.Empty(host.Chat.Sent);
        Assert.Equal(0, (await host.Db.Outbox.SingleAsync()).Attempts);
    }

    // The port promises a failed OUTCOME, never an exception – Outbox is not written to
    // survive one. This pins the blast radius when an adapter breaks that promise, and it
    // is the reason ChatSenderContractTests exists: DispatchDueAsync calls
    // SaveChangesAsync once, after the loop, so an escaping exception discards the
    // bookkeeping for every message already delivered in that batch. They are re-sent on
    // the next tick, because as far as the database is concerned they never went out.
    [Fact]
    public async Task An_exception_escaping_the_adapter_discards_the_whole_batch()
    {
        using var host = new TestHost();
        var outbox = host.NewOutbox();
        await outbox.EnqueueAsync("notice", 1, "первое");
        await outbox.EnqueueAsync("notice", 2, "второе");

        host.Chat.Delivers(8).Throws(new InvalidOperationException("adapter let this escape"));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => outbox.DispatchDueAsync(CancellationToken.None));

        // Both were handed to the adapter, and the first genuinely reached the chat.
        Assert.Equal(2, host.Chat.Sent.Count);

        // A second context sees what was persisted, not what the tracked entities hold.
        // The delivered message is still pending: it will go out again, so the reader
        // gets it twice.
        using var fresh = host.NewDbContext();
        var rows = await fresh.Outbox.OrderBy(m => m.Id).ToListAsync();
        Assert.Equal("pending", rows[0].Status);
        Assert.Equal(0, rows[0].Attempts);
        Assert.Equal("pending", rows[1].Status);
    }

    // ---- helpers -----------------------------------------------------------------

    private static OutboxMessage Pending(long chatId, DateTimeOffset? nextAttempt = null, string text = "hi") =>
        new()
        {
            Kind = "notice",
            ChatId = chatId,
            Text = text,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow,
            NextAttemptAt = nextAttempt ?? DateTimeOffset.UtcNow.AddSeconds(-1),
        };
}
