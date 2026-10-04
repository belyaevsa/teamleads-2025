using TeamleadsBackend.Data;
using TeamleadsBackend.Sim;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// Real answers for the simulator. The numbers this replaces were written by hand, so the
// properties pinned here are all about never showing a count nobody gave: unknown ids are
// refused, a browser counts once, and a reworded scenario starts from zero.
public class SimVotesTests
{
    private const string Archive = """
        {
          "quizzes": [], "questions": [],
          "scenarios": [{
            "id": "handover",
            "prompt": "Разработчик уходит через две недели.",
            "options": [
              { "label": "Посадить рядом джуна", "good": true, "outcome": "" },
              { "label": "Попросить написать доку", "good": false, "outcome": "" }
            ]
          }]
        }
        """;

    // Same scenario, second option reworded.
    private const string Reworded = """
        {
          "quizzes": [], "questions": [],
          "scenarios": [{
            "id": "handover",
            "prompt": "Разработчик уходит через две недели.",
            "options": [
              { "label": "Посадить рядом джуна", "good": true, "outcome": "" },
              { "label": "Попросить написать подробную доку", "good": false, "outcome": "" }
            ]
          }]
        }
        """;

    [Fact]
    public async Task An_answer_to_a_real_option_is_counted()
    {
        using var host = new TestHost();
        var votes = host.Votes(Archive);

        Assert.Equal(SimVotes.RecordResult.Recorded, await votes.RecordAsync("handover", 1, "a", default));

        var site = (await votes.AllAsync(default))!["handover"].Site!;
        Assert.Equal(new[] { 0, 1 }, site.Counts);
        Assert.Equal(1, site.Total);
    }

    [Fact]
    public async Task Ids_and_options_that_are_not_in_the_deck_are_refused()
    {
        using var host = new TestHost();
        var votes = host.Votes(Archive);

        Assert.Equal(SimVotes.RecordResult.UnknownScenario, await votes.RecordAsync("made-up", 0, "a", default));
        Assert.Equal(SimVotes.RecordResult.BadOption, await votes.RecordAsync("handover", 2, "a", default));
        Assert.Empty(host.NewDbContext().SimAnswers);
    }

    [Fact]
    public async Task A_browser_counts_once_per_scenario()
    {
        using var host = new TestHost();
        var votes = host.Votes(Archive);

        await votes.RecordAsync("handover", 0, "a", default);
        Assert.Equal(SimVotes.RecordResult.Duplicate, await votes.RecordAsync("handover", 1, "a", default));

        Assert.Single(host.NewDbContext().SimAnswers);
    }

    // Answers are stored by position. After a rewording, position 1 means something
    // else, so the old answers must not be shown against the new text.
    [Fact]
    public async Task Rewording_the_options_starts_the_count_over()
    {
        using var host = new TestHost();
        await host.Votes(Archive).RecordAsync("handover", 1, "a", default);

        var after = host.Votes(Reworded);
        Assert.False((await after.AllAsync(default))!.ContainsKey("handover"));

        // ...and the same browser may answer the new wording.
        Assert.Equal(SimVotes.RecordResult.Recorded, await after.RecordAsync("handover", 1, "a", default));
    }

    [Fact]
    public async Task The_chat_tally_is_shown_only_against_the_wording_it_was_given_for()
    {
        using var host = new TestHost();
        host.Db.BotPosts.Add(new BotPost
        {
            Kind = "dilemma", Key = "handover", PostedAt = DateTimeOffset.UtcNow.AddDays(-2),
            Payload = """{"Id":"handover","Prompt":"…","Options":[{"Label":"Посадить рядом джуна","Good":true},{"Label":"Попросить написать доку","Good":false}]}""",
            Tally = "[5,2]",
        });
        await host.Db.SaveChangesAsync();

        var chat = (await host.Votes(Archive).AllAsync(default))!["handover"].Chat!;
        Assert.Equal(new[] { 5, 2 }, chat.Counts);
        Assert.Equal(7, chat.Total);

        Assert.False((await host.Votes(Reworded).AllAsync(default))!.ContainsKey("handover"));
    }

    [Fact]
    public async Task A_scenario_nobody_answered_is_left_out()
    {
        using var host = new TestHost();
        Assert.Empty((await host.Votes(Archive).AllAsync(default))!);
    }

    [Theory]
    [InlineData(2, 5, "2 из 5")]
    [InlineData(0, 14, "0 из 14")]
    [InlineData(5, 15, "33%")]
    [InlineData(1, 3 * SimVotes.PercentFrom, "2%")]
    public void Small_samples_are_counts_and_large_ones_are_percentages(int count, int total, string expected) =>
        Assert.Equal(expected, SimVotes.Share(count, total));
}
