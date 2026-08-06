using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeamleadsBackend.BotData;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Telegram;

// «Вопрос недели»: one open question from the meetup backlog posted to the
// community chat as a discussion starter.
//
// Unlike the dilemma poll, there is no vote and no follow-up – the point is to
// start a conversation. The question carries a link to the meetup where it was
// first raised, so people can read the original discussion before answering.
//
// Rotation is round-robin over all unanswered questions in feed order, same as
// dilemmas. Idempotency lives in the BotPosts table (Kind = "agenda").
public sealed class QuestionService(
    AppDbContext db,
    BotDataClient archive,
    IChatSender chat,
    SettingsService settings,
    IOptions<TelegramOptions> options,
    ILogger<QuestionService> log)
{
    private const string Kind = "agenda";
    private readonly TelegramOptions _opt = options.Value;

    // Scheduler entry point: post only if nothing went out inside `cooldown`.
    public async Task<string?> PostIfDueAsync(TimeSpan cooldown, CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow - cooldown;
        var recent = await db.BotPosts.AnyAsync(p => p.Kind == Kind && p.PostedAt > since, ct);
        return recent ? null : await PostAsync(ct);
    }

    // Posts the next unused question. Returns a human-readable outcome for the admin chat.
    public async Task<string> PostAsync(CancellationToken ct)
    {
        if (!_opt.Enabled) return "Telegram не сконфигурирован.";

        var communityChat = await settings.GetLongAsync("tg.community_chat_id", ct);
        if (communityChat == 0) return "Не задан tg.community_chat_id.";

        var data = await archive.GetAsync(ct);
        if (data is null || data.Questions.Count == 0) return "Архив недоступен или нет вопросов.";

        var used = await db.BotPosts.Where(p => p.Kind == Kind).Select(p => p.Key).ToListAsync(ct);
        var question = PickNext(data.Questions, used);
        if (question is null) return "Все вопросы уже были опубликованы.";

        var sent = await chat.SendMessageAsync(new ChatMessage(communityChat, FormatQuestion(question)), ct);
        if (!sent.Ok) return $"Не отправилось: {sent.Error}";

        db.BotPosts.Add(new BotPost
        {
            Kind = Kind,
            Key = question.Url ?? question.Question,
            ChatId = communityChat,
            MessageId = sent.MessageId,
            PostedAt = DateTimeOffset.UtcNow,
            Payload = JsonSerializer.Serialize(question),
        });
        await db.SaveChangesAsync(ct);

        log.LogInformation("Question {Key} posted as message {MessageId}.",
            question.Url ?? question.Question, sent.MessageId);
        return $"Вопрос «{Trunc(question.Question, 60)}» опубликован.";
    }

    private static string FormatQuestion(BotDataClient.BacklogQuestion q)
    {
        var lines = new List<string> { "❓ Вопрос недели", "", q.Question };
        if (!string.IsNullOrWhiteSpace(q.Event) || !string.IsNullOrWhiteSpace(q.Date))
        {
            var source = q.Event ?? "";
            if (!string.IsNullOrWhiteSpace(q.Date)) source += $" ({q.Date})";
            lines.Add("");
            lines.Add($"Из обсуждения: {source.Trim()}");
        }
        if (!string.IsNullOrWhiteSpace(q.Url)) lines.Add(q.Url);
        return string.Join("\n", lines);
    }

    private static BotDataClient.BacklogQuestion? PickNext(
        IReadOnlyList<BotDataClient.BacklogQuestion> all, List<string> used)
    {
        var usedSet = used.ToHashSet(StringComparer.Ordinal);
        return all.FirstOrDefault(q => !usedSet.Contains(q.Url ?? q.Question));
    }

    private static string Trunc(string text, int limit) =>
        text.Length <= limit ? text : text[..(limit - 1)].TrimEnd() + "…";
}
