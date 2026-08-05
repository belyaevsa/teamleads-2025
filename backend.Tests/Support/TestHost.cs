using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Tests.Support;

// One isolated database + a real SettingsService, plus both halves of the Telegram seam:
//
//   Chat     – a FakeChatSender behind the IChatSender port. This is what Outbox uses,
//              and it is why the delivery-loop tests do not care which client ships.
//   Telegram – the concrete TelegramClient over a stub socket, for the tests that assert
//              on the actual bytes a client puts on the wire.
//
// SettingsService is sealed and its 5-minute cache is part of the behaviour under test
// (a chat id resolved late is the whole point of ChatSetting), so it is constructed for
// real rather than faked.
public sealed class TestHost : IDisposable
{
    private readonly ServiceProvider _provider;

    public StubBotApi Api { get; } = new();
    public FakeChatSender Chat { get; } = new();
    public AppDbContext Db { get; }
    public SettingsService Settings { get; }
    public TelegramClient Telegram { get; }

    private readonly string _dbName;

    public TestHost(string? botToken = "TEST:token")
    {
        var services = new ServiceCollection();

        // Unique name per host so parallel test classes never share rows.
        var dbName = _dbName = $"outbox-{Guid.NewGuid():N}";
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

    // Defaults to the fake port. Pass a real adapter to drive the loop through an actual
    // client – useful for a smoke test, but the behaviour assertions belong on the fake.
    public Outbox NewOutbox(IChatSender? sender = null) =>
        new(Db, sender ?? Chat, Settings, NullLogger<Outbox>.Instance);

    // The production adapter, wired to the stub socket. Same object Program.cs registers.
    public IChatSender BotApiSender() => new BotApiChatSender(Telegram);

    // A second context over the same store, for asking what was actually PERSISTED
    // rather than what the tracked entities happen to hold. Db alone cannot tell the
    // difference: an unsaved mutation is still visible through the context that made it.
    public AppDbContext NewDbContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(_dbName)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options);

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

    // A second SettingsService over the same store, with a logger the test can read.
    // `Settings` above stays on NullLogger – the tests that only need values should not
    // have to care that the service logs at all.
    public SettingsService NewSettings(ILogger<SettingsService> log) =>
        new(_provider.GetRequiredService<IServiceScopeFactory>(), log);

    public void Dispose()
    {
        Db.Dispose();
        _provider.Dispose();
    }
}
