using TeamleadsBackend.Settings;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// What this process believes its settings are, and when that belief changed.
//
// The snapshot is process-wide with a 5-minute TTL and is only invalidated by writes that
// go through SettingsService, so a row changed with SQL straight against the table is
// invisible here until the TTL lapses. That is a reasonable cache and an unreasonable
// mystery: when the admin group was upgraded to a supergroup, the table held the new chat
// id while the bot kept addressing the old one, and nothing in the log said which value
// was in play. These lines are the answer, so the question is asked of the log next time
// rather than of the code.
public class SettingsSnapshotLogTests
{
    private const string AdminChat = "tg.admin_chat_id";

    [Fact]
    public async Task Startup_reports_the_values_this_process_will_be_using()
    {
        using var host = new TestHost();
        await host.SetSettingAsync(AdminChat, "-1004294696151");
        var log = new CapturingLogger<SettingsService>();

        await host.NewSettings(log).WarmUpAsync(CancellationToken.None);

        Assert.True(log.Said("Settings loaded"));
        // The value itself, not just a count: "loaded 9 keys" would not have answered the
        // question that made this exist.
        Assert.True(log.Said($"{AdminChat}=-1004294696151"));
    }

    // The catalog defaults are not a silent state. A table that has not been seeded looks
    // exactly like one that has, until the bot starts posting nowhere.
    [Fact]
    public async Task Startup_says_so_when_the_table_is_empty()
    {
        using var host = new TestHost();
        var log = new CapturingLogger<SettingsService>();

        await host.NewSettings(log).WarmUpAsync(CancellationToken.None);

        Assert.True(log.Said("catalog default"));
    }

    // The line that would have explained the supergroup evening in one grep.
    [Fact]
    public async Task A_changed_value_is_reported_with_both_sides_of_the_change()
    {
        using var host = new TestHost();
        await host.SetSettingAsync(AdminChat, "-100500");
        var log = new CapturingLogger<SettingsService>();
        var settings = host.NewSettings(log);
        await settings.WarmUpAsync(CancellationToken.None);

        await settings.SetAsync(AdminChat, "-1004294696151", byTgId: null, CancellationToken.None);
        await settings.GetLongAsync(AdminChat, CancellationToken.None);   // reload after Invalidate

        Assert.True(log.Said("-100500 → -1004294696151"));
    }

    // Every five minutes, for ever, on a system where nothing happened. Noise is how the
    // one line that matters gets missed.
    [Fact]
    public async Task An_unchanged_refresh_says_nothing()
    {
        using var host = new TestHost();
        await host.SetSettingAsync(AdminChat, "-100500");
        var log = new CapturingLogger<SettingsService>();
        var settings = host.NewSettings(log);
        await settings.WarmUpAsync(CancellationToken.None);
        var afterStartup = log.Lines.Count;

        settings.Invalidate();
        await settings.GetLongAsync(AdminChat, CancellationToken.None);

        Assert.Equal(afterStartup, log.Lines.Count);
    }
}
