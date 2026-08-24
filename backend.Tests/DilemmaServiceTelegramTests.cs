using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// The weekly dilemma: sendPoll on Monday, stopPoll + sendMessage a day later.
//
// This is the only feature that uses polls at all, so it is the only place where a
// client swap can lose them. Two things are pinned here that a wire test cannot see:
// that the tally read back out of stopPoll is the one rendered into the reveal, and that
// a post is recorded – or not recorded – strictly on what the send reported.
public class DilemmaServiceTelegramTests
{
    private const long Community = -1001234567890;

    private const string Archive = """
        {
          "generated": "2026-08-01",
          "quizzes": [],
          "questions": [],
          "scenarios": [
            {
              "id": "handover",
              "prompt": "Разработчик уходит через две недели, передавать некому.",
              "lesson": "Передача – это процесс, а не встреча.",
              "link": { "title": "Разбор на митапе", "url": "https://teamleads.kz/events/handover/" },
              "options": [
                { "label": "Посадить рядом джуна", "good": true, "votes": 61, "outcome": "Дорого, но знание остается." },
                { "label": "Попросить написать доку", "good": false, "votes": 39, "outcome": "Док никто не прочитает." }
              ]
            }
          ]
        }
        """;

    private static async Task<TestHost> HostAsync(bool community = true)
    {
        var host = new TestHost();
        if (community) await host.SetSettingAsync("tg.community_chat_id", Community.ToString());
        return host;
    }

    // ── posting ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_dilemma_goes_out_as_an_anonymous_poll_carrying_every_option()
    {
        using var host = await HostAsync();
        host.Chat.Delivers(555);

        var answer = await host.Dilemmas(Archive).PostAsync(default);

        Assert.Equal("Дилемма handover опубликована.", answer);
        var call = Assert.Single(host.Chat.Calls);
        Assert.Equal("sendPoll", call.Method);
        Assert.Equal(Community, call.ChatId);
        Assert.Contains("🎯 Дилемма недели", call.Text);
        Assert.Contains("Разработчик уходит через две недели", call.Text);

        Assert.Equal<IEnumerable<string>>(["Посадить рядом джуна", "Попросить написать доку"], call.Options!);

        // Anonymity and "not a quiz" are not asserted here because they are no longer
        // assertable: ChatPoll cannot express a correct answer or a named vote, so no
        // adapter can send one. That is the stronger version of the old check – it used
        // to read is_anonymous=true off the payload, which only proved this one client
        // remembered to set it. Whether each adapter puts that on the wire is
        // ChatSenderContractTests' job.
    }

    [Fact]
    public async Task The_post_is_recorded_against_the_message_id_the_send_reported()
    {
        using var host = await HostAsync();
        host.Chat.Delivers(555);

        await host.Dilemmas(Archive).PostAsync(default);

        var post = Assert.Single(host.NewDbContext().BotPosts);
        Assert.Equal("dilemma", post.Kind);
        Assert.Equal("handover", post.Key);
        Assert.Equal(Community, post.ChatId);
        // The follow-up closes THIS message a day later. A client reporting 0 here leaves
        // stopPoll aimed at nothing, and the reveal goes out with no tally forever after.
        Assert.Equal(555, post.MessageId);
        Assert.Null(post.FollowedUpAt);
        Assert.Contains("handover", post.Payload);
    }

    // Nothing is recorded on a failed send, so the next tick retries the same dilemma
    // rather than skipping a week and burning it.
    [Fact]
    public async Task A_refused_poll_records_nothing_and_reports_the_reason()
    {
        using var host = await HostAsync();
        host.Chat.Fails("Bad Request: chat not found");

        var answer = await host.Dilemmas(Archive).PostAsync(default);

        Assert.Equal("Не отправилось: Bad Request: chat not found", answer);
        Assert.Empty(host.NewDbContext().BotPosts);
    }

    [Fact]
    public async Task Already_posted_dilemmas_are_not_repeated()
    {
        using var host = await HostAsync();
        host.Db.BotPosts.Add(new BotPost { Kind = "dilemma", Key = "handover", PostedAt = DateTimeOffset.UtcNow.AddDays(-30) });
        await host.Db.SaveChangesAsync();

        var answer = await host.Dilemmas(Archive).PostAsync(default);

        Assert.Equal("Все дилеммы уже были опубликованы.", answer);
        Assert.Empty(host.Chat.Calls);
    }

    [Fact]
    public async Task Nothing_is_sent_when_the_community_chat_is_not_configured()
    {
        using var host = await HostAsync(community: false);

        Assert.Equal("Не задан tg.community_chat_id.", await host.Dilemmas(Archive).PostAsync(default));
        Assert.Empty(host.Chat.Calls);
    }

    [Fact]
    public async Task Nothing_is_sent_when_the_bot_is_not_configured()
    {
        using var host = new TestHost(botToken: null);
        await host.SetSettingAsync("tg.community_chat_id", Community.ToString());

        Assert.Equal("Telegram не сконфигурирован.", await host.Dilemmas(Archive).PostAsync(default));
        Assert.Empty(host.Chat.Calls);
    }

    // Telegram accepts 2-10 options and refuses the call outright otherwise. Catching it
    // here keeps a content bug from becoming a Bot API error the admin has to decode.
    [Fact]
    public async Task A_scenario_that_does_not_fit_a_poll_is_skipped_before_the_call()
    {
        using var host = await HostAsync();
        const string oneOption = """
            {
              "quizzes": [], "questions": [],
              "scenarios": [{
                "id": "handover",
                "prompt": "Разработчик уходит через две недели.",
                "options": [{ "label": "Посадить рядом джуна", "good": true, "votes": 61, "outcome": "" }]
              }]
            }
            """;

        var answer = await host.Dilemmas(oneOption).PostAsync(default);

        Assert.StartsWith("Сценарий handover не влезает в опрос", answer);
        Assert.Empty(host.Chat.Calls);
    }

    // ── the reveal ──────────────────────────────────────────────────────────

    // Yesterday's poll, posted by the code that really posts it – so the payload snapshot
    // the reveal reads back is byte for byte the one production writes. Hand-authoring
    // that JSON is how a test passes while the real round trip deserializes to nulls.
    private static async Task<BotPost> PostedYesterdayAsync(TestHost host)
    {
        host.Chat.Delivers(555);
        await host.Dilemmas(Archive).PostAsync(default);

        var post = host.Db.BotPosts.Single();
        post.PostedAt = DateTimeOffset.UtcNow.AddDays(-1);
        await host.Db.SaveChangesAsync();

        host.Chat.Calls.Clear();   // the reveal's assertions start from an empty call log
        return post;
    }

    [Fact]
    public async Task The_reveal_closes_the_poll_and_posts_the_tally_it_read_back()
    {
        using var host = await HostAsync();
        await PostedYesterdayAsync(host);
        host.Chat.StopsPoll(3, 1);                                                          // stopPoll
        host.Chat.Delivers(556);                                                            // sendMessage

        var answer = await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.FromHours(20), default);

        Assert.Equal("Раскрыта дилемма handover.", answer);

        // stopPoll went through the port when the package grew it (0.0.75), so the
        // service's calls are asserted on the port alone – no socket is involved.
        var stop = host.Chat.Calls.Single(c => c.Method == "stopPoll");
        Assert.Equal(Community, stop.ChatId);
        Assert.Equal(555, stop.MessageId);

        var reveal = host.Chat.Calls.Single(c => c.Method == "sendMessage");
        Assert.Equal(Community, reveal.ChatId);
        // 3 of 4 votes and 1 of 4. The percentages are the whole reason stopPoll is called;
        // a client that loses the counts turns the reveal into a text the chat has read.
        Assert.Contains("чат: 75%", reveal.Text);
        Assert.Contains("чат: 25%", reveal.Text);
        Assert.Contains("Дорого, но знание остается.", reveal.Text);
        Assert.Contains("💡 Передача – это процесс", reveal.Text);
        Assert.Contains("https://teamleads.kz/events/handover/", reveal.Text);
    }

    // stopPoll fails on a poll someone already closed by hand, or a deleted message. The
    // consequences are worth more than the numbers, so the reveal goes out regardless.
    [Fact]
    public async Task A_poll_that_cannot_be_closed_still_gets_its_reveal_without_percentages()
    {
        using var host = await HostAsync();
        await PostedYesterdayAsync(host);
        host.Chat.FailsToStopPoll("Bad Request: poll has already been closed");
        host.Chat.Delivers(556);

        var answer = await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.FromHours(20), default);

        Assert.Equal("Раскрыта дилемма handover.", answer);
        var reveal = Assert.Single(host.Chat.Calls, c => c.Method == "sendMessage");
        Assert.DoesNotContain("чат:", reveal.Text);
        // The site's own votes are a separate source and survive a lost tally.
        Assert.Contains("сайт: 61%", reveal.Text);
        Assert.NotNull(host.NewDbContext().BotPosts.Single().FollowedUpAt);
    }

    // Settling on a failed send would leave the chat with a closed poll and no
    // consequences, permanently – there is no second chance at a reveal.
    [Fact]
    public async Task A_reveal_that_did_not_send_is_retried_on_the_next_tick()
    {
        using var host = await HostAsync();
        await PostedYesterdayAsync(host);
        host.Chat.StopsPoll(3, 1);
        host.Chat.Fails("Bad Request: have no rights to send a message");

        var answer = await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.FromHours(20), default);

        Assert.StartsWith("Не отправилось", answer);
        Assert.Null(host.NewDbContext().BotPosts.Single().FollowedUpAt);
    }

    [Fact]
    public async Task A_poll_that_is_not_due_yet_is_left_running()
    {
        using var host = await HostAsync();
        await PostedYesterdayAsync(host);

        Assert.Equal("Нечего раскрывать.", await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.FromDays(7), default));
        Assert.Empty(host.Chat.Calls);
    }

    [Fact]
    public async Task A_reveal_is_never_posted_twice()
    {
        using var host = await HostAsync();
        var post = await PostedYesterdayAsync(host);
        post.FollowedUpAt = DateTimeOffset.UtcNow;
        await host.Db.SaveChangesAsync();

        Assert.Equal("Нечего раскрывать.", await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.Zero, default));
        Assert.Empty(host.Chat.Calls);
    }

    // Nothing to say, so nothing is sent – and the post is settled anyway rather than
    // retried on every tick from here to the heat death of the container.
    [Fact]
    public async Task A_post_whose_snapshot_is_gone_is_settled_without_a_call()
    {
        using var host = await HostAsync();
        var post = await PostedYesterdayAsync(host);
        post.Payload = null;
        await host.Db.SaveChangesAsync();

        Assert.Equal("Снимок сценария потерян, пропускаем.",
            await host.Dilemmas(Archive).FollowUpAsync(TimeSpan.Zero, default));
        Assert.Empty(host.Chat.Calls);
        Assert.NotNull(host.NewDbContext().BotPosts.Single().FollowedUpAt);
    }
}
