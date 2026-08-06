using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// «Вопрос недели»: one message, no poll, no follow-up.
//
// Small surface, and exactly the reason it is worth pinning – it is the one scheduled
// post that would keep reporting success while sending nothing, because there is no
// second act to notice the first one never happened.
public class QuestionServiceTelegramTests
{
    private const long Community = -1001234567890;

    private const string Archive = """
        {
          "generated": "2026-08-01",
          "scenarios": [],
          "quizzes": [],
          "questions": [
            {
              "question": "Как понять, что тимлид перерос свою команду?",
              "event": "Тимлид не кодит #12",
              "date": "27.07.2026",
              "url": "https://teamleads.kz/events/tnk-12/"
            },
            { "question": "Второй вопрос из бэклога.", "event": null, "date": null, "url": null }
          ]
        }
        """;

    private static async Task<TestHost> HostAsync(bool community = true)
    {
        var host = new TestHost();
        if (community) await host.SetSettingAsync("tg.community_chat_id", Community.ToString());
        return host;
    }

    [Fact]
    public async Task The_question_goes_out_as_one_message_with_its_source_link()
    {
        using var host = await HostAsync();
        host.Api.RespondsOk(messageId: 777);

        var answer = await host.Questions(Archive).PostAsync(default);

        Assert.Contains("опубликован", answer);
        var call = Assert.Single(host.Api.Calls);
        Assert.Equal("sendMessage", call.Method);
        Assert.Equal(Community, call.Long("chat_id"));

        var text = call.String("text")!;
        Assert.StartsWith("❓ Вопрос недели", text);
        Assert.Contains("Как понять, что тимлид перерос свою команду?", text);
        // The link back to the meetup where it was raised is the point: people can read
        // the original discussion before answering.
        Assert.Contains("Из обсуждения: Тимлид не кодит #12 (27.07.2026)", text);
        Assert.Contains("https://teamleads.kz/events/tnk-12/", text);
        Assert.False(call.Has("parse_mode"));
    }

    // Discussion starter, not a quiz: no poll, no keyboard, nothing to press.
    [Fact]
    public async Task Nothing_but_a_plain_message_is_sent()
    {
        using var host = await HostAsync();

        await host.Questions(Archive).PostAsync(default);

        var call = Assert.Single(host.Api.Calls);
        Assert.False(call.Has("reply_markup"));
        Assert.DoesNotContain(host.Api.Calls, c => c.Method == "sendPoll");
    }

    [Fact]
    public async Task The_post_is_recorded_against_the_message_id_the_send_reported()
    {
        using var host = await HostAsync();
        host.Api.RespondsOk(messageId: 777);

        await host.Questions(Archive).PostAsync(default);

        var post = Assert.Single(host.NewDbContext().BotPosts);
        Assert.Equal("agenda", post.Kind);
        // Keyed by url when there is one – that is what rotation reads back.
        Assert.Equal("https://teamleads.kz/events/tnk-12/", post.Key);
        Assert.Equal(777, post.MessageId);
    }

    [Fact]
    public async Task A_refused_send_records_nothing_so_the_question_comes_round_again()
    {
        using var host = await HostAsync();
        host.Api.RespondsError("Forbidden: bot is not a member of the supergroup chat");

        var answer = await host.Questions(Archive).PostAsync(default);

        Assert.StartsWith("Не отправилось:", answer);
        Assert.Empty(host.NewDbContext().BotPosts);
    }

    [Fact]
    public async Task Rotation_moves_on_to_the_next_unused_question()
    {
        using var host = await HostAsync();
        host.Db.BotPosts.Add(new BotPost
        {
            Kind = "agenda",
            Key = "https://teamleads.kz/events/tnk-12/",
            PostedAt = DateTimeOffset.UtcNow.AddDays(-30),
        });
        await host.Db.SaveChangesAsync();

        await host.Questions(Archive).PostAsync(default);

        Assert.Contains("Второй вопрос из бэклога.", host.Api.LastCall.String("text"));
        // No url on the second one, so the question text itself is the rotation key.
        Assert.Equal("Второй вопрос из бэклога.", host.NewDbContext().BotPosts.Single(p => p.MessageId != 0).Key);
    }

    // The cooldown is what makes a five-minute scheduler tick safe: the posting window is
    // an hour wide, so without it a Monday morning would produce twelve questions.
    [Fact]
    public async Task A_recent_post_suppresses_the_scheduled_one_entirely()
    {
        using var host = await HostAsync();
        host.Db.BotPosts.Add(new BotPost { Kind = "agenda", Key = "x", PostedAt = DateTimeOffset.UtcNow.AddHours(-1) });
        await host.Db.SaveChangesAsync();

        Assert.Null(await host.Questions(Archive).PostIfDueAsync(TimeSpan.FromDays(3), default));
        Assert.Empty(host.Api.Calls);
    }

    [Fact]
    public async Task Nothing_is_sent_when_the_community_chat_is_not_configured()
    {
        using var host = await HostAsync(community: false);

        Assert.Equal("Не задан tg.community_chat_id.", await host.Questions(Archive).PostAsync(default));
        Assert.Empty(host.Api.Calls);
    }

    [Fact]
    public async Task Nothing_is_sent_when_the_archive_has_no_questions_left()
    {
        using var host = await HostAsync();

        var answer = await host.Questions("""{"scenarios":[],"quizzes":[],"questions":[]}""").PostAsync(default);

        Assert.Equal("Архив недоступен или нет вопросов.", answer);
        Assert.Empty(host.Api.Calls);
    }
}
