using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Tests.Support;

// One isolated database + a real SettingsService + a TelegramClient wired to a stub
// socket. Everything except the network is the production type: SettingsService is
// sealed and its 5-minute cache is part of the behaviour under test (a chat id resolved
// late is the whole point of ChatSetting), so it is constructed for real rather than faked.
public sealed class TestHost : IDisposable
{
    private readonly ServiceProvider _provider;

    public StubBotApi Api { get; } = new();
    public AppDbContext Db { get; }
    public SettingsService Settings { get; }
    public TelegramClient Telegram { get; }

    public TestHost(string? botToken = "TEST:token")
    {
        var services = new ServiceCollection();

        // Unique name per host so parallel test classes never share rows.
        var dbName = $"outbox-{Guid.NewGuid():N}";
        services.AddDbContext<AppDbContext>(o => o
            .UseInMemoryDatabase(dbName)
            // The dispatcher never joins across the graph, and InMemory has no real
            // transactions – silencing the warning keeps the noise out of test output.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning)));
        _provider = services.BuildServiceProvider();

        Db = _provider.GetRequiredService<AppDbContext>();
        Settings = new SettingsService(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SettingsService>.Instance);

        Telegram = new TelegramClient(
            new HttpClient(Api) { BaseAddress = new Uri("https://api.telegram.org/") },
            Options.Create(new TelegramOptions { BotToken = botToken, WebhookSecret = "s" }),
            NullLogger<TelegramClient>.Instance);
    }

    public Outbox NewOutbox() => new(Db, Telegram, Settings, NullLogger<Outbox>.Instance);

    // Writes straight to the table rather than going through SettingsService.SetAsync so
    // a test can seed a value without also asserting the write path.
    public async Task SetSettingAsync(string key, string value)
    {
        var row = await Db.Settings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) Db.Settings.Add(row = new Setting { Key = key });
        row.Value = value;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await Db.SaveChangesAsync();
        Settings.Invalidate();   // otherwise the 5-minute cache hides the change
    }

    public void Dispose()
    {
        Db.Dispose();
        _provider.Dispose();
    }
}
