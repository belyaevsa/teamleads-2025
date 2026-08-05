using Microsoft.EntityFrameworkCore;
using TeamleadsBackend.Data;

namespace TeamleadsBackend.Settings;

// Runtime settings with a 5-minute cache.
//
// Singleton on purpose: the cache is process-wide, and callers (the scheduler tick,
// the anon flood check) must not each pay a query. The DbContext is scoped, so reads
// happen inside a short-lived scope.
//
// The table is the only source; the SeedSettings migration fills it with the catalog
// defaults. The catalog default still backs every read, so a key the seeder has not
// written yet – or a database that is briefly unreachable – degrades to the same value
// the seed would have produced. Settings can never be the reason the bot stops working.
public sealed class SettingsService(IServiceScopeFactory scopes, ILogger<SettingsService> log)
{
    public static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private Dictionary<string, string> _cache = new(StringComparer.OrdinalIgnoreCase);
    private DateTimeOffset _loadedAt = DateTimeOffset.MinValue;

    // Separate from _loadedAt on purpose. Invalidate() rewinds _loadedAt to MinValue to
    // force a reload, so "_loadedAt is MinValue" means "reload due", NOT "never loaded" –
    // reading it as the latter made every /set announce itself as a fresh startup and
    // swallow the before → after line, which is the one worth having.
    private bool _everLoaded;

    public async Task<bool> GetBoolAsync(string key, CancellationToken ct) =>
        bool.TryParse(await GetRawAsync(key, ct), out var v) && v;

    public async Task<long> GetLongAsync(string key, CancellationToken ct) =>
        long.TryParse(await GetRawAsync(key, ct), out var v)
            ? v
            : long.Parse(SettingsCatalog.Find(key)?.Default ?? "0");

    public async Task<int> GetIntAsync(string key, CancellationToken ct) =>
        int.TryParse(await GetRawAsync(key, ct), out var v)
            ? v
            : int.Parse(SettingsCatalog.Find(key)?.Default ?? "0");

    public async Task<string> GetRawAsync(string key, CancellationToken ct)
    {
        var entry = SettingsCatalog.Find(key)
            ?? throw new ArgumentException($"Unknown setting '{key}' – add it to SettingsCatalog.", nameof(key));

        await EnsureFreshAsync(ct);
        return _cache.TryGetValue(key, out var stored) ? stored : entry.Default;
    }

    // Every catalog entry with its effective value. `source` stays useful after the
    // move to a single source: it shows whether a key is really in the table yet, or is
    // still riding the catalog default because its seed migration has not been applied.
    public async Task<IReadOnlyList<object>> DescribeAsync(CancellationToken ct)
    {
        await EnsureFreshAsync(ct);
        return SettingsCatalog.All.Select(object (e) =>
        {
            var (value, source) = _cache.TryGetValue(e.Key, out var db)
                ? (db, "db")
                : (e.Default, "default");
            return new { key = e.Key, value, source, kind = e.Kind.ToString().ToLowerInvariant(), e.Description };
        }).ToList();
    }

    public async Task<string?> SetAsync(string key, string value, long? byTgId, CancellationToken ct)
    {
        var entry = SettingsCatalog.Find(key);
        if (entry is null) return $"Неизвестный параметр «{key}».";
        if (SettingsCatalog.Validate(entry, value) is { } error) return $"{key}: {error}.";

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var row = await db.Settings.FirstOrDefaultAsync(s => s.Key == entry.Key, ct);
        if (row is null) db.Settings.Add(row = new Setting { Key = entry.Key });
        row.Value = value;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        row.UpdatedByTgId = byTgId;
        await db.SaveChangesAsync(ct);

        Invalidate();   // a write must take effect now, not up to 5 minutes later
        log.LogInformation("Setting {Key} set to {Value}.", entry.Key, value);
        return null;
    }

    public void Invalidate() => _loadedAt = DateTimeOffset.MinValue;

    // Loads the snapshot ahead of the first reader. Called once from Program.cs so the
    // startup line below is always in the log at a known point, instead of appearing
    // whenever some background tick happens to ask for a value first.
    public Task WarmUpAsync(CancellationToken ct) => EnsureFreshAsync(ct);

    // Says out loud what this process believes, and when that belief changed.
    //
    // Written because the belief and the table can differ and nothing showed it: the
    // snapshot is process-wide with a 5-minute TTL and is only invalidated by a write
    // that goes THROUGH this service, so a value changed with SQL straight against the
    // table stays invisible here for up to Ttl. That is a fine trade for a cache – it is
    // not a fine trade for having to guess which id the bot is actually using, which is
    // exactly the guess an upgraded supergroup forced.
    //
    // Values are safe to print: SettingsCatalog admits no secrets, by construction – see
    // the comment on Data/Setting.cs.
    //
    // Quiet when nothing moved. A line every five minutes forever would be noise, and
    // noise is how the one line that mattered gets missed.
    private void LogSnapshot(Dictionary<string, string> fresh)
    {
        if (!_everLoaded)
        {
            _everLoaded = true;
            log.LogInformation("Settings loaded: {Count} key(s) from the database, refreshed every {Ttl:g}. {Values}",
                fresh.Count, Ttl, Render(fresh));
            return;
        }

        var changes = fresh
            .Where(kv => !_cache.TryGetValue(kv.Key, out var old) || old != kv.Value)
            .Select(kv => _cache.TryGetValue(kv.Key, out var old) ? $"{kv.Key}: {old} → {kv.Value}" : $"{kv.Key} = {kv.Value} (new)")
            .Concat(_cache.Keys.Where(k => !fresh.ContainsKey(k)).Select(k => $"{k} removed, back to the catalog default"))
            .ToList();

        if (changes.Count == 0) return;

        log.LogInformation("Settings changed: {Changes}", string.Join("; ", changes));
    }

    private static string Render(Dictionary<string, string> values) =>
        values.Count == 0
            ? "The table is empty – every key is running on its catalog default."
            : string.Join(", ", values.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => $"{kv.Key}={kv.Value}"));

    private async Task EnsureFreshAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - _loadedAt < Ttl) return;

        await _gate.WaitAsync(ct);
        try
        {
            if (DateTimeOffset.UtcNow - _loadedAt < Ttl) return;

            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var rows = await db.Settings.AsNoTracking().ToListAsync(ct);

            // Rows for keys since removed from the catalog are ignored rather than
            // deleted: a rollback to the previous image must find its settings intact.
            var fresh = rows.Where(r => SettingsCatalog.Find(r.Key) is not null)
                            .ToDictionary(r => r.Key, r => r.Value, StringComparer.OrdinalIgnoreCase);

            LogSnapshot(fresh);
            _cache = fresh;
            _loadedAt = DateTimeOffset.UtcNow;
        }
        catch (Exception ex)
        {
            // Keep serving the previous snapshot (or env/defaults on a cold start) and
            // retry on the next call – settings must not be able to take the bot down.
            _loadedAt = DateTimeOffset.UtcNow - Ttl + TimeSpan.FromSeconds(30);
            log.LogWarning(ex, "Settings refresh failed; using previous values.");
        }
        finally { _gate.Release(); }
    }
}
