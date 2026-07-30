using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TeamleadsBackend.BotData;

// Reads the archive feed the site publishes at /bot-data.json (built by
// landing-main/layouts/index.botdata.json).
//
// Why a feed and not a copy: the content repo stays the single source of truth.
// Hugo already knows how "articles/slug" resolves to a URL and which questions are
// still unanswered; duplicating that here would rot the first time content moves.
// The landing and the backend also deploy independently, so anything baked into
// this image at build time would go stale on the next content push.
//
// Two transports, same code path:
//   BOT_DATA_PATH – read the file off disk. Both services run on the same host, so
//                   the nginx docroot (/opt/teamleads.kz/latest/bot-data.json) is a
//                   local read: no network, fresh the instant a landing deploy lands.
//   BOT_DATA_URL  – fetch over HTTP with ETag revalidation. The fallback, and what
//                   works if the two ever split hosts.
// A failed refresh never takes the feature down: the last good snapshot keeps serving.
public sealed class BotDataClient(HttpClient http, IConfiguration cfg, ILogger<BotDataClient> log)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(15);
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private ArchiveData? _cache;
    private DateTimeOffset _fetchedAt;
    private string? _etag;

    public async Task<ArchiveData?> GetAsync(CancellationToken ct)
    {
        if (_cache is not null && DateTimeOffset.UtcNow - _fetchedAt < Ttl) return _cache;

        await _gate.WaitAsync(ct);
        try
        {
            if (_cache is not null && DateTimeOffset.UtcNow - _fetchedAt < Ttl) return _cache;
            await RefreshAsync(ct);
            return _cache;
        }
        finally { _gate.Release(); }
    }

    private async Task RefreshAsync(CancellationToken ct)
    {
        var path = cfg["BOT_DATA_PATH"];
        try
        {
            if (!string.IsNullOrWhiteSpace(path))
            {
                await using var stream = File.OpenRead(path);
                _cache = await JsonSerializer.DeserializeAsync<ArchiveData>(stream, Json, ct);
            }
            else
            {
                var url = cfg["BOT_DATA_URL"] ?? "https://teamleads.kz/bot-data.json";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                if (_etag is not null) req.Headers.TryAddWithoutValidation("If-None-Match", _etag);

                using var resp = await http.SendAsync(req, ct);
                if (resp.StatusCode == HttpStatusCode.NotModified)
                {
                    _fetchedAt = DateTimeOffset.UtcNow;   // unchanged: keep the snapshot, reset the TTL
                    return;
                }
                resp.EnsureSuccessStatusCode();
                _etag = resp.Headers.ETag?.Tag;
                _cache = await resp.Content.ReadFromJsonAsync<ArchiveData>(Json, ct);
            }

            _fetchedAt = DateTimeOffset.UtcNow;
            log.LogInformation("Archive feed loaded: {Scenarios} scenarios, {Questions} open questions, generated {Generated}.",
                _cache?.Scenarios.Count ?? 0, _cache?.Questions.Count ?? 0, _cache?.Generated);
        }
        catch (Exception ex)
        {
            // Stale data beats no data: a weekly poll is worth more than a gap.
            log.LogWarning(ex, "Archive feed refresh failed; serving snapshot from {FetchedAt}.", _fetchedAt);
            if (_cache is null) throw;
        }
    }

    // ── feed shape (mirrors layouts/index.botdata.json) ──────────────────────

    public sealed record ArchiveData(
        [property: JsonPropertyName("generated")] string? Generated,
        [property: JsonPropertyName("scenarios")] IReadOnlyList<Scenario> Scenarios,
        [property: JsonPropertyName("quizzes")] IReadOnlyList<Quiz> Quizzes,
        [property: JsonPropertyName("questions")] IReadOnlyList<BacklogQuestion> Questions);

    public sealed record Scenario(
        string Id,
        string Prompt,
        IReadOnlyList<ScenarioOption> Options,
        string? Lesson,
        ArchiveLink? Link);

    public sealed record ScenarioOption(string Label, bool Good, int Votes, string? Outcome);

    public sealed record ArchiveLink(string? Title, string? Url);

    public sealed record Quiz(string Id, string Title, string? Url, IReadOnlyList<QuizQuestion> Questions);

    public sealed record QuizQuestion(string Prompt, IReadOnlyList<ScenarioOption> Options, string? Lesson);

    public sealed record BacklogQuestion(string Question, string? Event, string? Date, string? Url);
}
