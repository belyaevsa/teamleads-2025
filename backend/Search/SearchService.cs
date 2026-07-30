using System.Text.RegularExpressions;

namespace TeamleadsBackend.Search;

// Full-text search over the site archive matching landing-main/static/js/retrieval.js ranking.
public sealed partial class SearchService(ShellIndexClient indexClient)
{
    private const string BaseUrl = "https://teamleads.kz";

    private static readonly HashSet<string> StopWords = new(
        "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если или быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтобы будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем про без"
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
        StringComparer.OrdinalIgnoreCase);

    public async Task<IReadOnlyList<SearchResult>> SearchAsync(string query, int limit = 10, CancellationToken ct = default)
    {
        query = (query ?? "").Trim();
        if (string.IsNullOrWhiteSpace(query)) return [];

        var index = await indexClient.GetIndexAsync(ct);
        if (index.Count == 0) return [];

        var tokens = Tokenize(query);
        if (tokens.Count == 0) return [];

        var phrase = query.ToLowerInvariant();
        var results = new List<SearchResult>();

        foreach (var entry in index)
        {
            var titleLower = (entry.Title ?? "").ToLowerInvariant();
            var bodyLower = (entry.Body ?? "").ToLowerInvariant();
            var score = 0;

            if (phrase.Length > 0 && titleLower.Contains(phrase, StringComparison.Ordinal)) score += 14;
            if (phrase.Length > 0 && bodyLower.Contains(phrase, StringComparison.Ordinal)) score += 5;

            foreach (var token in tokens)
            {
                if (titleLower.Contains(token, StringComparison.Ordinal)) score += 6;

                var pos = 0;
                var count = 0;
                while (pos >= 0 && count < 3)
                {
                    pos = bodyLower.IndexOf(token, pos, StringComparison.Ordinal);
                    if (pos >= 0)
                    {
                        score += 1;
                        count++;
                        pos += token.Length;
                    }
                }
            }

            if (score > 0)
            {
                var rawUrl = entry.Url ?? "";
                var fullUrl = rawUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                    ? rawUrl
                    : $"{BaseUrl}{rawUrl}";

                results.Add(new SearchResult(
                    Title: entry.Title ?? "",
                    Section: SectionLabel(entry.Section ?? ""),
                    SectionRaw: entry.Section ?? "",
                    Url: fullUrl,
                    Snippet: Snippet(entry.Body ?? "", phrase, tokens),
                    Score: score));
            }
        }

        return results.OrderByDescending(r => r.Score).Take(limit).ToList();
    }

    private static List<string> Tokenize(string text)
    {
        // No Distinct(): retrieval.js scores a repeated word once per occurrence in
        // the query, and this ranking has to match the site's hit for hit.
        return CleanRegex().Split(text.ToLowerInvariant())
            .Where(t => t.Length > 2 && !StopWords.Contains(t))
            .ToList();
    }

    private static string Snippet(string body, string phrase, List<string> tokens)
    {
        if (string.IsNullOrWhiteSpace(body)) return "";

        var bodyLower = body.ToLowerInvariant();
        var pos = -1;

        if (!string.IsNullOrWhiteSpace(phrase))
            pos = bodyLower.IndexOf(phrase, StringComparison.Ordinal);

        for (var i = 0; pos == -1 && i < tokens.Count; i++)
            pos = bodyLower.IndexOf(tokens[i], StringComparison.Ordinal);

        if (pos == -1) pos = 0;

        var start = Math.Max(0, pos - 42);
        var end = Math.Min(body.Length, start + 120);

        var chunk = body[start..end].Replace('\n', ' ').Replace('\r', ' ');
        chunk = Regex.Replace(chunk, @"\s+", " ").Trim();

        var prefix = start > 0 ? "… " : "";
        var suffix = end < body.Length ? " …" : "";

        return $"{prefix}{chunk}{suffix}";
    }

    public static string SectionLabel(string section) => section.ToLowerInvariant() switch
    {
        "events" => "🎯 Митап",
        "articles" => "📄 Статья",
        "insights" => "💡 Дайджест",
        "toolkit" => "🛠 Шаблон",
        "showcase" => "🚀 Шоукейс",
        _ => "📚 Архив",
    };

    [GeneratedRegex(@"[^a-zа-я0-9ё]+", RegexOptions.IgnoreCase)]
    private static partial Regex CleanRegex();

    public sealed record SearchResult(
        string Title,
        string Section,
        string SectionRaw,
        string Url,
        string Snippet,
        int Score);
}
