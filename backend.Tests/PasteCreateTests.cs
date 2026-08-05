using System.Reflection;
using TeamleadsBackend.Endpoints;
using Xunit;

namespace TeamleadsBackend.Tests;

// What POST /api/pastes is willing to believe about who is calling.
//
// It is unauthenticated, and a paste page renders an author name next to a "из Telegram"
// label. The endpoint used to take both from the request body, so anyone could publish a
// paste on teamleads.kz under a community member's name; supplying author_tg_id also
// switched off the ip_hash, so filling in one field opted the sender out of the only
// abuse trail there is. Authorship now comes from the Telegram update or not at all.
public class PasteCreateTests
{
    private static readonly Type PasteBody =
        typeof(PasteEndpoints).GetNestedType("PasteBody", BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("PasteEndpoints.PasteBody is gone – update this test.");

    // The rule, not the field list: any member that names an author is one an
    // unauthenticated caller could set, whatever it ends up being called.
    [Fact]
    public void The_public_create_body_has_no_author_field_of_any_kind()
    {
        var properties = PasteBody.GetProperties();
        // Guards against passing vacuously if the record is renamed out from under us.
        Assert.Contains(properties, p => p.Name == "Content");

        var authorish = properties
            .Where(p => p.Name.Contains("author", StringComparison.OrdinalIgnoreCase)
                     || p.Name.Contains("name", StringComparison.OrdinalIgnoreCase)
                     || p.Name.Contains("tgid", StringComparison.OrdinalIgnoreCase))
            .Select(p => p.Name)
            .ToArray();

        Assert.Empty(authorish);
    }

    // "bot" is the label that makes the page claim a Telegram origin. Only the webhook
    // has an update to back that up, so the public endpoint cannot mint one.
    [Theory]
    [InlineData("bot")]
    [InlineData("BOT")]
    [InlineData(" bot ")]
    [InlineData("telegram")]
    [InlineData("admin")]
    [InlineData("")]
    [InlineData(null)]
    public void An_unrecognised_or_privileged_source_becomes_web(string? source)
    {
        Assert.Equal("web", PasteEndpoints.NormalizeSource(source));
    }

    // The two real callers keep working: /paste/ sends "web", the shell sends "shell".
    [Theory]
    [InlineData("shell", "shell")]
    [InlineData("SHELL", "shell")]
    [InlineData("web", "web")]
    public void The_labels_the_site_actually_sends_survive(string sent, string stored)
    {
        Assert.Equal(stored, PasteEndpoints.NormalizeSource(sent));
    }
}
