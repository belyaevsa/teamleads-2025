using TeamleadsBackend.Settings;
using Xunit;

namespace TeamleadsBackend.Tests;

// The two value kinds the voice settings brought in. A model id with a space in it or a
// chat list with a typo would otherwise sit in the table looking fine and fail at the
// first voice message – the validator turns both into an answer to the /set that wrote them.
public class SettingsCatalogTests
{
    private static string? Validate(string key, string value) =>
        SettingsCatalog.Validate(SettingsCatalog.Find(key)!, value);

    [Theory]
    [InlineData("-1002424547330")]
    [InlineData("-1002424547330,-1001234567890")]
    [InlineData("-1002424547330, -1001234567890")]
    [InlineData("0")]
    public void A_chat_list_takes_ids_separated_by_commas(string value) =>
        Assert.Null(Validate("voice.chats", value));

    [Theory]
    [InlineData("-100242454733O")]      // a letter O, not a zero
    [InlineData("community")]
    public void A_chat_list_with_anything_but_ids_is_refused(string value) =>
        Assert.NotNull(Validate("voice.chats", value));

    [Fact]
    public void A_chat_list_parses_to_its_ids()
    {
        Assert.True(SettingsCatalog.TryParseLongList("-1002424547330, -1001234567890", out var ids));
        Assert.Equal(new[] { -1002424547330, -1001234567890 }, ids);
    }

    [Theory]
    [InlineData("microsoft/mai-transcribe-2", true)]
    [InlineData("deepseek/deepseek-v4.1-flash", true)]
    [InlineData("deepseek v4", false)]
    public void A_model_id_is_one_token(string value, bool valid) =>
        Assert.Equal(valid, Validate("voice.llm_model", value) is null);
}
