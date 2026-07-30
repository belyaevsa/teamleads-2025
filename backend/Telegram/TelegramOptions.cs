namespace TeamleadsBackend.Telegram;

// Bot wiring, supplied as flat env vars (see backend.env.example).
//
// With no BotToken configured the whole anonymous-requests feature is inert:
// the webhook 404s and /api/anon still accepts and stores requests, they just
// don't reach the admin chat. That keeps a misconfigured deploy from crashing
// the rest of the API.
public sealed class TelegramOptions
{
    public string? BotToken { get; init; }
    public string? WebhookSecret { get; init; }
    public long AdminChatId { get; init; }
    public long CommunityChatId { get; init; }

    public bool Enabled =>
        !string.IsNullOrWhiteSpace(BotToken)
        && !string.IsNullOrWhiteSpace(WebhookSecret)
        && AdminChatId != 0
        && CommunityChatId != 0;

    public static TelegramOptions FromConfiguration(IConfiguration cfg) => new()
    {
        BotToken = cfg["TG_BOT_TOKEN"],
        WebhookSecret = cfg["TG_WEBHOOK_SECRET"],
        AdminChatId = ParseId(cfg["TG_ADMIN_CHAT_ID"]),
        CommunityChatId = ParseId(cfg["TG_COMMUNITY_CHAT_ID"]),
    };

    private static long ParseId(string? raw) =>
        long.TryParse(raw, out var id) ? id : 0;
}
