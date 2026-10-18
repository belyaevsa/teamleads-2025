namespace TeamleadsBackend.Transcription;

// The LLM gateway's credentials, as flat env vars like the bot's (see backend.env.example).
//
// The key is a secret, so it lives here and never in the settings table; which models it
// is spent on is not, so those are settings (voice.stt_model, voice.llm_model) and change
// without a deploy. With no key the voice feature is inert: /paste on a voice message
// answers that transcription is off, and everything else in the bot is untouched.
public sealed class OpenRouterOptions
{
    public string? ApiKey { get; init; }

    // Overridable so the transcription flow can be driven against a stub in tests.
    public string ApiBase { get; init; } = "https://openrouter.ai/api/v1/";

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey);

    public static OpenRouterOptions FromConfiguration(IConfiguration cfg) => new()
    {
        ApiKey = cfg["OPENROUTER_API_KEY"],
        ApiBase = cfg["OPENROUTER_API_BASE"] ?? "https://openrouter.ai/api/v1/",
    };
}
