namespace TeamleadsBackend.Settings;

// The closed list of what may live in the settings table.
//
// A closed list rather than free-form keys, for two reasons. It keeps secrets out
// (nothing can be stored that isn't declared here, so no one can "helpfully" move the
// bot token into the database), and it turns a typo into a 400 instead of a setting
// that silently does nothing – the failure mode of every string-keyed config store.
//
// The table is the single source: the SeedSettings migration writes these keys into it,
// and SettingsService reads only from there. The Default below is both the seed value
// and the backstop for a key the table has never seen – not a runtime fallback chain.
// Env vars are deliberately not consulted: two places to set the same thing is how you
// get a deploy that silently reverts what someone changed from their phone.
//
// Adding a key here means adding it to a migration too (see 20260730133138_SeedSettings).
public static class SettingsCatalog
{
    // Text is an identifier (a model id), not prose: one token, no spaces. LongList is
    // comma-separated chat ids, for "which chats may use this" – empty means none.
    public enum ValueKind { Bool, Int, Long, Text, LongList }

    public sealed record Entry(
        string Key,
        ValueKind Kind,
        string Default,
        string Description,
        int Min = int.MinValue,
        int Max = int.MaxValue);

    public static readonly IReadOnlyList<Entry> All =
    [
        new("tg.admin_chat_id", ValueKind.Long, "0",
            "Приватный чат админов: туда приходят карточки модерации и там работают /set, /dilemma. 0 – не задан."),

        new("tg.community_chat_id", ValueKind.Long, "0",
            "Основной чат сообщества: туда публикуются анонимные вопросы и дилеммы. 0 – не задан."),

        new("tg.scheduler.enabled", ValueKind.Bool, "false",
            "Мастер-выключатель плановых постов бота в чат."),

        new("tg.dilemma.dow", ValueKind.Int, "2",
            "День недели для «дилеммы недели» (0=воскресенье), время Алматы.", Min: 0, Max: 6),

        new("tg.dilemma.hour", ValueKind.Int, "11",
            "Час публикации дилеммы, время Алматы.", Min: 0, Max: 23),

        new("tg.dilemma.reveal_hours", ValueKind.Int, "24",
            "Через сколько часов раскрывать последствия дилеммы.", Min: 1, Max: 168),

        new("tg.question.dow", ValueKind.Int, "4",
            "День недели для «вопроса недели» (0=воскресенье), время Алматы.", Min: 0, Max: 6),

        new("tg.question.hour", ValueKind.Int, "11",
            "Час публикации вопроса недели, время Алматы.", Min: 0, Max: 23),

        new("anon.max_pending_per_author", ValueKind.Int, "5",
            "Сколько анонимных запросов от одного автора может ждать модерации.", Min: 1, Max: 100),

        new("voice.enabled", ValueKind.Bool, "false",
            "Расшифровка голосовых по /paste. Выключатель на случай, если надо срезать расходы на OpenRouter."),

        new("voice.chats", ValueKind.LongList, "",
            "Группы, где работает расшифровка голосовых, через запятую (0 – нигде). В личке – только участникам этих групп."),

        new("voice.max_minutes", ValueKind.Int, "15",
            "Максимальная длина голосового для расшифровки, в минутах.", Min: 1, Max: 60),

        new("voice.stt_model", ValueKind.Text, "microsoft/mai-transcribe-2",
            "Модель OpenRouter для распознавания речи."),

        new("voice.llm_model", ValueKind.Text, "deepseek/deepseek-v4.1-flash",
            "Модель OpenRouter, которая превращает расшифровку в markdown с разделами."),
    ];

    private static readonly Dictionary<string, Entry> ByKey =
        All.ToDictionary(e => e.Key, StringComparer.OrdinalIgnoreCase);

    public static Entry? Find(string key) => ByKey.GetValueOrDefault(key);

    // Returns null when valid, otherwise the reason. Keeps a bad value out of the
    // database instead of letting it surface later as a scheduler that never fires.
    public static string? Validate(Entry entry, string value) => entry.Kind switch
    {
        ValueKind.Bool when !bool.TryParse(value, out _) => "ожидается true или false",
        ValueKind.Int when !int.TryParse(value, out _) => "ожидается целое число",
        ValueKind.Long when !long.TryParse(value, out _) => "ожидается целое число",
        ValueKind.Text when value.Length is 0 or > 200 || value.Any(char.IsWhiteSpace)
            => "ожидается идентификатор без пробелов, до 200 символов",
        ValueKind.LongList when !TryParseLongList(value, out _) => "ожидаются целые числа через запятую",
        ValueKind.Int when int.Parse(value) < entry.Min || int.Parse(value) > entry.Max
            => $"допустимый диапазон: {entry.Min}–{entry.Max}",
        _ => null,
    };

    public static bool TryParseLongList(string value, out long[] items)
    {
        items = [];
        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var parsed = new long[parts.Length];
        for (var i = 0; i < parts.Length; i++)
            if (!long.TryParse(parts[i], out parsed[i])) return false;
        items = parsed;
        return true;
    }
}
