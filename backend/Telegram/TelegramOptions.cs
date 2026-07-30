namespace TeamleadsBackend.Telegram;

// Bot credentials, supplied as flat env vars (see backend.env.example).
//
// With no BotToken configured the whole anonymous-requests feature is inert:
// the webhook 404s and /api/anon still accepts and stores requests, they just
// don't reach the admin chat. That keeps a misconfigured deploy from crashing
// the rest of the API.
//
// Chat ids are not here – they live in the settings table (tg.admin_chat_id,
// tg.community_chat_id). They are the identity values that change without a deploy:
// a moderation group gets recreated, a community migrates to a new supergroup, and
// neither should need a rebuild. What stays here is what must not touch the database.
public sealed class TelegramOptions
{
    public string? BotToken { get; init; }
    public string? WebhookSecret { get; init; }

    // Overridable so the bot flows can be driven against a mock Bot API in tests.
    public string ApiBase { get; init; } = "https://api.telegram.org/";

    public bool Enabled =>
        !string.IsNullOrWhiteSpace(BotToken)
        && !string.IsNullOrWhiteSpace(WebhookSecret);

    public static TelegramOptions FromConfiguration(IConfiguration cfg) => new()
    {
        BotToken = cfg["TG_BOT_TOKEN"],
        WebhookSecret = cfg["TG_WEBHOOK_SECRET"],
        ApiBase = cfg["TG_API_BASE"] ?? "https://api.telegram.org/",
    };

}
