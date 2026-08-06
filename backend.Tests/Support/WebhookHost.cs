using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Search;
using TeamleadsBackend.Settings;
using TeamleadsBackend.Telegram;

namespace TeamleadsBackend.Tests.Support;

// The webhook, served for real, with the Bot API replaced by the stub socket.
//
// The handlers are private statics inside a minimal-API lambda: an update posted over
// HTTP is the only honest way in, and it also covers the two gates (path secret, header
// token) that are the whole access control on this route. Everything else is the same
// object graph Program.cs builds – one AppDbContext store, one SettingsService, one
// TelegramClient – so the assertions land on real bytes.
//
// Only MapTelegramWebhook is mapped. Program.cs is not reused because it demands a
// Postgres connection string at line one and would drag in migrations, the rate limiter
// and two hosted services, none of which this route touches.
public sealed class WebhookHost : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly HttpClient _client;

    public TestHost Host { get; }
    public StubBotApi Api => Host.Api;

    private WebhookHost(TestHost host, WebApplication app, HttpClient client)
    {
        Host = host;
        _app = app;
        _client = client;
    }

    public static async Task<WebhookHost> StartAsync(
        TestHost host, string searchIndexJson = "[]", params (string Key, string Value)[] config)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            ContentRootPath = AppContext.BaseDirectory,
        });

        builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(
            config.Select(c => new KeyValuePair<string, string?>(c.Key, c.Value)));
        builder.WebHost.UseUrls("http://127.0.0.1:0");

        // Same store as the TestHost, so a test can seed a row and read the result back
        // through the context it already holds.
        builder.Services.AddScoped(_ => host.NewDbContext());
        builder.Services.AddSingleton(Options.Create(host.TgOptions));
        builder.Services.AddSingleton(host.Telegram);
        builder.Services.AddSingleton(host.Settings);
        builder.Services.AddSingleton(TestHost.Search(searchIndexJson));
        builder.Services.AddScoped<Outbox>();
        // The card is queued, never sent from the webhook – the fake port stands in for
        // the dispatcher, which does not run here.
        builder.Services.AddScoped<IChatSender>(_ => host.Chat);
        builder.Services.AddScoped<AnonService>();
        builder.Services.AddScoped<DilemmaService>();
        builder.Services.AddScoped<QuestionService>();
        builder.Services.AddSingleton(_ => TestHost.Archive("""{"scenarios":[],"quizzes":[],"questions":[]}"""));

        var app = builder.Build();
        app.MapGroup("/api").MapTelegramWebhook();
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();

        return new WebhookHost(host, app, new HttpClient { BaseAddress = new Uri(address) });
    }

    // Posts an update the way Telegram does: both secrets correct unless a test says
    // otherwise. Returns the status code, because "always 200" is itself a contract –
    // anything else makes Telegram redeliver the same update forever.
    public async Task<int> PostAsync(string updateJson, string? pathSecret = null, string? headerToken = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"/api/tg/webhook/{pathSecret ?? TestHost.WebhookSecret}")
        {
            Content = new StringContent(updateJson, Encoding.UTF8, "application/json"),
        };
        request.Headers.TryAddWithoutValidation(
            "X-Telegram-Bot-Api-Secret-Token", headerToken ?? TestHost.WebhookSecret);

        using var response = await _client.SendAsync(request);
        return (int)response.StatusCode;
    }

    public async ValueTask DisposeAsync()
    {
        _client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
