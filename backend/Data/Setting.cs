namespace TeamleadsBackend.Data;

// A runtime-tunable setting, editable without a deploy.
//
// NOT for secrets. Tokens, the admin key and IP_HASH_SALT stay in the env file:
// putting the salt next to the AuthorHash column it salts would mean one database
// dump is enough to brute-force telegram ids back out of the hashes, which is the
// exact property the anonymous-requests feature promises. SettingsCatalog enforces
// this – only keys declared there can be stored or read here.
public class Setting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
    public long? UpdatedByTgId { get; set; }   // when changed from the admin chat
}
