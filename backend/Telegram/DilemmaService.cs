using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeamleadsBackend.BotData;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Telegram;

// «Дилемма недели»: one simulator scenario posted to the community chat as an
// anonymous poll, with the consequences revealed a day later.
//
// The shape is the point. A vote costs nothing and is anonymous, so people who never
// type in a chat full of their colleagues still take part. The reveal a day later is
// the second act: it gives everyone who voted a reason to come back and argue, and it
// carries the archive link into the discussion instead of advertising it separately.
public sealed class DilemmaService(
    AppDbContext db,
    BotDataClient archive,
    TelegramClient tg,
    SettingsService settings,
    IOptions<TelegramOptions> options,
    ILogger<DilemmaService> log)
{
    private const string Kind = "dilemma";
    private readonly TelegramOptions _opt = options.Value;

    // Scheduler entry point: post only if nothing went out inside `cooldown`. This is
    // what makes a five-minute tick safe – the window is an hour wide, the cooldown is
    // days wide, so repeated ticks (and container restarts) collapse into one post.
    public async Task<string?> PostIfDueAsync(TimeSpan cooldown, CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow - cooldown;
        var recent = await db.BotPosts.AnyAsync(p => p.Kind == Kind && p.PostedAt > since, ct);
        return recent ? null : await PostAsync(ct);
    }

    // Posts the next unused dilemma. Returns a human-readable outcome for the admin chat.
    public async Task<string> PostAsync(CancellationToken ct)
    {
        if (!_opt.Enabled) return "Telegram не сконфигурирован.";

        var communityChat = await settings.GetLongAsync("tg.community_chat_id", ct);
        if (communityChat == 0) return "Не задан tg.community_chat_id.";

        var data = await archive.GetAsync(ct);
        if (data is null || data.Scenarios.Count == 0) return "Архив недоступен.";

        var used = await db.BotPosts.Where(p => p.Kind == Kind).Select(p => p.Key).ToListAsync(ct);
        var scenario = PickNext(data.Scenarios, used);
        if (scenario is null) return "Все дилеммы уже были опубликованы.";

        var options = scenario.Options.Select(o => PollText.Option(o.Label)).ToList();
        if (options.Count is < 2 or > PollText.MaxOptions)
        {
            log.LogWarning("Scenario {Id} has {Count} options; Telegram allows 2-{Max}. Skipped.",
                scenario.Id, options.Count, PollText.MaxOptions);
            return $"Сценарий {scenario.Id} не влезает в опрос ({options.Count} вариантов).";
        }

        var sent = await tg.SendPollAsync(communityChat, PollText.Question(Question(scenario)), options, ct: ct);
        if (!sent.Ok) return $"Не отправилось: {sent.Error}";

        db.BotPosts.Add(new BotPost
        {
            Kind = Kind,
            Key = scenario.Id,
            ChatId = communityChat,
            MessageId = sent.MessageId,
            PostedAt = DateTimeOffset.UtcNow,
            Payload = JsonSerializer.Serialize(scenario),
        });
        await db.SaveChangesAsync(ct);

        log.LogInformation("Dilemma {Id} posted as message {MessageId}.", scenario.Id, sent.MessageId);
        return $"Дилемма {scenario.Id} опубликована.";
    }

    // Closes yesterday's poll and posts the consequences as a reply to it.
    public async Task<string> FollowUpAsync(TimeSpan after, CancellationToken ct)
    {
        var due = DateTimeOffset.UtcNow - after;
        var post = await db.BotPosts
            .Where(p => p.Kind == Kind && p.FollowedUpAt == null && p.PostedAt <= due)
            .OrderBy(p => p.PostedAt)
            .FirstOrDefaultAsync(ct);
        if (post is null) return "Нечего раскрывать.";

        var scenario = post.Payload is null
            ? null
            : JsonSerializer.Deserialize<BotDataClient.Scenario>(post.Payload);
        if (scenario is null)
        {
            post.FollowedUpAt = DateTimeOffset.UtcNow;   // nothing to say; don't retry forever
            await db.SaveChangesAsync(ct);
            return "Снимок сценария потерян, пропускаем.";
        }

        // stopPoll gives the final tally. If it fails (poll already closed, message
        // deleted) we still publish the outcomes – the reveal matters more than the numbers.
        var votes = await tg.StopPollAsync(post.ChatId, post.MessageId, ct);
        var sent = await tg.SendMessageAsync(post.ChatId, Reveal(scenario, votes), ct: ct);

        post.FollowedUpAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return sent.Ok ? $"Раскрыта дилемма {post.Key}." : $"Не отправилось: {sent.Error}";
    }

    // Round-robin by content order, not random: the sequence stays predictable and
    // every scenario gets its turn before any repeats.
    private static BotDataClient.Scenario? PickNext(IReadOnlyList<BotDataClient.Scenario> all, List<string> used)
    {
        var usedSet = used.ToHashSet(StringComparer.Ordinal);
        return all.FirstOrDefault(s => !usedSet.Contains(s.Id));
    }

    private static string Question(BotDataClient.Scenario s) => $"🎯 Дилемма недели\n\n{s.Prompt}\n\nВаши действия?";

    private static string Reveal(BotDataClient.Scenario s, int[]? votes)
    {
        var total = votes?.Sum() ?? 0;
        var lines = new List<string> { "🎯 Дилемма недели – последствия", "", s.Prompt, "" };

        for (var i = 0; i < s.Options.Count; i++)
        {
            var o = s.Options[i];
            var chat = votes is not null && i < votes.Length && total > 0
                ? $" · чат: {100 * votes[i] / total}%"
                : "";
            // `Votes` is how the site's own visitors answered – a second opinion to
            // argue with, which is usually more interesting than the "right" answer.
            var site = o.Votes > 0 ? $" · сайт: {o.Votes}%" : "";
            lines.Add($"{(o.Good ? "✅" : "▫️")} {o.Label}{chat}{site}");
            if (!string.IsNullOrWhiteSpace(o.Outcome)) lines.Add($"    {o.Outcome}");
        }

        if (!string.IsNullOrWhiteSpace(s.Lesson)) { lines.Add(""); lines.Add($"💡 {s.Lesson}"); }
        if (s.Link?.Url is { Length: > 0 } url) { lines.Add(""); lines.Add($"Разбор: {s.Link.Title}\n{url}"); }

        return string.Join("\n", lines);
    }
}
