using System.Reflection;
using TeamleadsBackend.Content;
using TeamleadsBackend.Data;
using TeamleadsBackend.Endpoints;
using TeamleadsBackend.Search;
using Xunit;

namespace TeamleadsBackend.Tests;

// What /p/{id} puts on the page.
//
// The paste body is anonymous user input rendered on our own origin, so the markdown
// path is the interesting one: a renderer that passes raw HTML through would hand any
// anonymous caller a script tag on teamleads.kz.
public class PastePageRenderTests
{
    private static readonly MethodInfo Render =
        typeof(PasteEndpoints).GetMethod("PastePageHtml", BindingFlags.NonPublic | BindingFlags.Static)
        ?? throw new InvalidOperationException("PasteEndpoints.PastePageHtml is gone – update this test.");

    private static string Page(string content, string? language = null) =>
        (string)Render.Invoke(null, [new Paste
        {
            PublicId = "A7F3K2X",
            Content = content,
            Language = language ?? LanguageDetector.Detect(content),
            Source = "web",
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
        }])!;

    // ── markdown ────────────────────────────────────────────────────────────

    [Fact]
    public void A_markdown_paste_renders_as_a_document_with_its_source_kept_behind_a_toggle()
    {
        var page = Page("# Постмортем\n\n- упало\n- починили\n");

        Assert.Contains("<h1>Постмортем</h1>", page);
        Assert.Contains("<li>упало</li>", page);
        Assert.Contains("data-source hidden", page);
        Assert.Contains("data-source-btn", page);
        // The rendered document replaces the code slab, not sits next to it.
        Assert.DoesNotContain("""<pre><code class="language-markdown">""", page);
    }

    [Fact]
    public void Raw_html_in_a_markdown_paste_is_shown_as_text_and_never_as_markup()
    {
        var page = Page("# Отчет\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n- список\n");

        Assert.DoesNotContain("<script>alert(1)</script>", page);
        Assert.DoesNotContain("<img src=x onerror", page);
        Assert.Contains("&lt;script&gt;", page);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("JavaScript:alert(1)")]
    [InlineData("data:text/html;base64,PHNjcmlwdD4=")]
    [InlineData("vbscript:msgbox(1)")]
    public void A_markdown_link_to_a_script_scheme_loses_its_target(string url)
    {
        var html = PasteMarkdown.ToHtml($"[жми]({url})");

        Assert.DoesNotContain("javascript:", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("data:", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("vbscript:", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("жми", html);   // the text survives, only the target goes
    }

    [Theory]
    [InlineData("https://teamleads.kz/paste/")]
    [InlineData("http://example.com/a?b=1")]
    [InlineData("mailto:to@belyaev.live")]
    [InlineData("/insights/")]
    [InlineData("#anchor")]
    public void An_ordinary_markdown_link_keeps_its_target(string url)
    {
        var html = PasteMarkdown.ToHtml($"[ссылка]({url})");

        Assert.Contains($"""href="{url}" """.TrimEnd(), html);
    }

    // ── code ────────────────────────────────────────────────────────────────

    [Fact]
    public void A_code_paste_keeps_the_plain_pre_and_the_wrap_toggle()
    {
        var page = Page("package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(1)\n}\n");

        Assert.Contains("""<pre><code class="language-go" data-raw>""", page);
        Assert.Contains("data-wrap>Перенос строк", page);
        // The source toggle belongs to markdown pastes only.
        Assert.DoesNotContain(">Исходник<", page);
    }

    [Fact]
    public void The_paste_body_is_html_encoded_on_the_code_path()
    {
        var page = Page("<script>alert(1)</script>\nconst x = 1;\nexport default x;\n", "javascript");

        Assert.DoesNotContain("<script>alert(1)</script>", page);
        Assert.Contains("&lt;script&gt;", page);
    }

    // Markdown became a language after some of the pastes on the site were created,
    // so their stored language is the old catch-all. Those still render as documents.
    [Fact]
    public void A_markdown_paste_stored_before_markdown_existed_still_renders_as_a_document()
    {
        var page = Page("# Постмортем\n\n- упало\n- починили\n", language: "text");

        Assert.Contains("<h1>Постмортем</h1>", page);
        Assert.Contains(">Markdown<", page);
    }

    // ── chrome ──────────────────────────────────────────────────────────────

    // The page used to be dark-only, and the feedback that started this was that pale
    // text on black plus a sideways scroll is hard to read. Light is now the default,
    // dark is reachable, and neither is hardcoded past the palette.
    [Fact]
    public void The_page_ships_a_light_default_a_dark_palette_and_a_switch_between_them()
    {
        var page = Page("select 1 from dual");

        Assert.Contains("""<meta name="color-scheme" content="light dark">""", page);
        Assert.Contains("--bg: #ffffff;", page);
        Assert.Contains("""(prefers-color-scheme: dark)""", page);
        Assert.Contains("""[data-theme="dark"]""", page);
        Assert.Contains("data-theme-btn", page);
        Assert.Contains("paste-theme", page);
    }

    // On a 2400px monitor a full-bleed page puts the reader's eyes at the far left of
    // the desk. The bars keep their full-width background; only the contents are pulled
    // into one centred column.
    [Fact]
    public void Wide_screens_get_a_centred_column_instead_of_full_bleed_text()
    {
        var page = Page("select 1 from dual");

        Assert.Contains("--measure: 1160px;", page);
        Assert.Contains("max(20px, (100% - var(--measure)) / 2)", page);
        Assert.Contains("margin-inline: auto", page);
    }

    [Fact]
    public void The_viewport_is_declared_so_phones_do_not_get_the_desktop_layout()
    {
        var page = Page("select 1 from dual");

        Assert.Contains("""<meta name="viewport" content="width=device-width, initial-scale=1">""", page);
        Assert.Contains("@media (max-width: 760px)", page);
    }
}
