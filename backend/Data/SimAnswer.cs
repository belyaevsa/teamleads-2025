namespace TeamleadsBackend.Data;

// One choice a site visitor made in the shell simulator (`sim`).
//
// Real answers instead of the numbers the deck used to carry: `votes` in scenarios.yaml
// was written by whoever authored the scenario and then shown on the site and in the
// chat as if people had voted. Nobody had.
//
// Only the FIRST pick per scenario per browser is recorded, and before the outcome is
// shown, so the count measures what people would do, not what they did after being told.
//
// Options are stored by position, so `OptionsKey` pins which wording that position
// meant: a hash of the option labels at answer time. Rewording or reordering a
// scenario's options changes the key, and the old answers simply stop counting rather
// than being attributed to options nobody saw.
public class SimAnswer
{
    public long Id { get; set; }
    public string ScenarioId { get; set; } = "";
    public int OptionIndex { get; set; }
    public string OptionsKey { get; set; } = "";
    public string? ClientHash { get; set; }   // salted hash of the browser's random id; null without IP_HASH_SALT
    public DateTimeOffset CreatedAt { get; set; }
}
