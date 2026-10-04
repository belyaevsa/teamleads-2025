using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using TeamleadsBackend.BotData;
using TeamleadsBackend.Data;

namespace TeamleadsBackend.Sim;

// How people actually answered the simulator's dilemmas – from two sources that are kept
// apart on purpose:
//
//   site – first picks in the shell `sim` (SimAnswer rows);
//   chat – the final tally of the weekly Telegram poll (BotPost.Tally).
//
// They are different audiences: the chat meets a dilemma cold and argues about it for a
// day, the site visitor usually arrives from the digest it came out of. Merging them
// would produce a number that describes neither.
//
// Everything is keyed by scenario id AND OptionsKey, so a count is only ever shown next
// to the exact option wording it was given for.
public sealed class SimVotes(AppDbContext db, BotDataClient archive, IMemoryCache cache)
{
    private const string StatsCacheKey = "sim-stats";
    private static readonly TimeSpan StatsTtl = TimeSpan.FromMinutes(1);

    public sealed record OptionCounts(int[] Counts, int Total);

    // Per scenario id; either side is null when there is nothing to show.
    public sealed record ScenarioVotes(OptionCounts? Site, OptionCounts? Chat);

    public enum RecordResult { Recorded, Duplicate, UnknownScenario, BadOption, FeedUnavailable }

    // 64 bits of SHA-256 over the labels in order. Wide enough that two wordings of one
    // scenario never collide, short enough to sit in every row.
    public static string OptionsKey(IEnumerable<string> labels)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", labels)));
        return Convert.ToHexStringLower(bytes)[..16];
    }

    // Validated against the live feed, so the table only ever holds answers to scenarios
    // and options that exist – a public endpoint cannot be used to seed fake ids.
    public async Task<RecordResult> RecordAsync(string scenarioId, int option, string? clientHash, CancellationToken ct)
    {
        BotDataClient.ArchiveData? data;
        try { data = await archive.GetAsync(ct); }
        catch (Exception) { return RecordResult.FeedUnavailable; }
        if (data is null) return RecordResult.FeedUnavailable;

        var scenario = data.Scenarios.FirstOrDefault(s => s.Id == scenarioId);
        if (scenario is null) return RecordResult.UnknownScenario;
        if (option < 0 || option >= scenario.Options.Count) return RecordResult.BadOption;

        var key = OptionsKey(scenario.Options.Select(o => o.Label));
        if (clientHash is not null && await db.SimAnswers.AnyAsync(
                a => a.ScenarioId == scenarioId && a.ClientHash == clientHash && a.OptionsKey == key, ct))
            return RecordResult.Duplicate;

        db.SimAnswers.Add(new SimAnswer
        {
            ScenarioId = scenarioId,
            OptionIndex = option,
            OptionsKey = key,
            ClientHash = clientHash,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        cache.Remove(StatsCacheKey);   // the voter should see their own answer counted
        return RecordResult.Recorded;
    }

    // Site answers for one scenario, for the chat reveal.
    public async Task<OptionCounts?> SiteCountsAsync(BotDataClient.Scenario scenario, CancellationToken ct)
    {
        var key = OptionsKey(scenario.Options.Select(o => o.Label));
        var rows = await db.SimAnswers.AsNoTracking()
            .Where(a => a.ScenarioId == scenario.Id && a.OptionsKey == key)
            .GroupBy(a => a.OptionIndex)
            .Select(g => new { Option = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        return Tally(scenario.Options.Count, rows.Select(r => (r.Option, r.Count)));
    }

    // Everything the shell needs in one response. Cached for a minute because the page is
    // public; RecordAsync drops the cache so a fresh answer is never hidden by it.
    public async Task<IReadOnlyDictionary<string, ScenarioVotes>?> AllAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(StatsCacheKey, out IReadOnlyDictionary<string, ScenarioVotes>? hit)) return hit;

        BotDataClient.ArchiveData? data;
        try { data = await archive.GetAsync(ct); }
        catch (Exception) { return null; }
        if (data is null) return null;

        var site = await db.SimAnswers.AsNoTracking()
            .GroupBy(a => new { a.ScenarioId, a.OptionsKey, a.OptionIndex })
            .Select(g => new { g.Key.ScenarioId, g.Key.OptionsKey, g.Key.OptionIndex, Count = g.Count() })
            .ToListAsync(ct);

        var polls = await db.BotPosts.AsNoTracking()
            .Where(p => p.Kind == "dilemma" && p.Tally != null)
            .OrderByDescending(p => p.PostedAt)
            .Select(p => new { p.Key, p.Payload, p.Tally })
            .ToListAsync(ct);

        var result = new Dictionary<string, ScenarioVotes>(StringComparer.Ordinal);
        foreach (var s in data.Scenarios)
        {
            var key = OptionsKey(s.Options.Select(o => o.Label));
            var siteCounts = Tally(s.Options.Count, site
                .Where(r => r.ScenarioId == s.Id && r.OptionsKey == key)
                .Select(r => (r.OptionIndex, r.Count)));

            // The latest poll of this scenario whose posted wording matches today's.
            OptionCounts? chat = null;
            foreach (var p in polls.Where(p => p.Key == s.Id))
            {
                if (ChatTally(p.Payload, p.Tally, key) is { } t) { chat = t; break; }
            }

            if (siteCounts is not null || chat is not null) result[s.Id] = new ScenarioVotes(siteCounts, chat);
        }

        cache.Set(StatsCacheKey, (IReadOnlyDictionary<string, ScenarioVotes>)result, StatsTtl);
        return result;
    }

    // Russian copy for a share of answers. Below 15 answers a percentage is noise dressed
    // as a measurement, so small samples are given as plain counts.
    public const int PercentFrom = 15;

    public static string Share(int count, int total) =>
        total >= PercentFrom ? $"{(int)Math.Round(100.0 * count / total)}%" : $"{count} из {total}";

    private static OptionCounts? Tally(int options, IEnumerable<(int Option, int Count)> rows)
    {
        var counts = new int[options];
        foreach (var (option, count) in rows)
            if (option >= 0 && option < options) counts[option] += count;
        var total = counts.Sum();
        return total == 0 ? null : new OptionCounts(counts, total);
    }

    private static OptionCounts? ChatTally(string? payload, string? tally, string currentKey)
    {
        if (payload is null || tally is null) return null;
        try
        {
            var posted = JsonSerializer.Deserialize<BotDataClient.Scenario>(payload);
            var votes = JsonSerializer.Deserialize<int[]>(tally);
            if (posted is null || votes is null) return null;
            if (OptionsKey(posted.Options.Select(o => o.Label)) != currentKey) return null;
            return Tally(posted.Options.Count, votes.Select((c, i) => (i, c)));
        }
        catch (JsonException) { return null; }
    }
}
