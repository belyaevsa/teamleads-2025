namespace TeamleadsBackend.BotData;

// Telegram poll limits are hard: question ≤300 chars, each option ≤100, 2-10 options.
// The archive was written for a website, so some texts overflow – 3 of 87 simulator
// options, and 19 of 53 backlog questions.
//
// Truncating mid-word looks broken, and truncating a dilemma option can change what
// the reader thinks they are voting for. So: prefer a natural label (the clause before
// a colon, which in this backlog is almost always the topic name), then fall back to a
// word-boundary cut. The full text always goes into the accompanying message, so nothing
// is lost – the shortening only ever affects the button, never the record.
public static class PollText
{
    public const int MaxQuestion = 300;
    public const int MaxOption = 100;
    public const int MaxOptions = 10;

    public static string Option(string text) => Shorten(text, MaxOption);

    public static string Question(string text) => Shorten(text, MaxQuestion);

    public static string Shorten(string text, int limit)
    {
        text = (text ?? "").Trim();
        if (text.Length <= limit) return text;

        // "Практика передачи проекта: какой минимальный набор артефактов…" → the clause
        // before the colon, when it is substantial enough to stand on its own.
        var colon = text.IndexOf(':');
        if (colon is >= 12 and < 90 && colon < limit) return text[..colon].Trim();

        var cut = text[..(limit - 1)];
        var lastSpace = cut.LastIndexOf(' ');
        if (lastSpace > limit / 2) cut = cut[..lastSpace];
        return cut.TrimEnd(' ', ',', '.', ';', '-', '–') + "…";
    }
}
