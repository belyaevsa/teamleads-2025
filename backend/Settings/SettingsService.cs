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
            _cache = rows.Where(r => SettingsCatalog.Find(r.Key) is not null)
                         .ToDictionary(r => r.Key, r => r.Value, StringComparer.OrdinalIgnoreCase);
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
