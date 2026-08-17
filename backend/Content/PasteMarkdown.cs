using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace TeamleadsBackend.Content;

// Renders a markdown paste to HTML for /p/{id}.
//
// Everything here is written on the assumption that the input is hostile: a paste is
// created by an anonymous POST, and the result is served from teamleads.kz, so anything
// that survives this class runs on our own origin.
//
// Two defences, both needed:
//   1. DisableHtml() – raw <script>/<iframe>/<img onerror> in the source is emitted as
//      escaped text instead of markup. This is the one that matters.
//   2. The link sweep below – DisableHtml does nothing about [click](javascript:...),
//      because that is a normal markdown link as far as the parser is concerned.
public static class PasteMarkdown
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .DisableHtml()
        .UsePipeTables()
        .UseAutoLinks()
        .UseTaskLists()
        .UseEmphasisExtras()
        .Build();

    // Schemes a paste is allowed to link to. Relative and protocol-relative urls carry no
    // scheme and are fine; everything unrecognised (javascript:, data:, vbscript:, and any
    // custom app scheme) is neutralised rather than dropped, so the link text still reads.
    private static readonly string[] AllowedSchemes = ["http", "https", "mailto", "tel", "ftp"];

    public static string ToHtml(string markdown)
    {
        var document = Markdown.Parse(markdown, Pipeline);

        foreach (var link in document.Descendants<LinkInline>())
        {
            if (!IsSafeUrl(link.Url)) link.Url = null;
        }

        using var writer = new StringWriter();
        var renderer = new Markdig.Renderers.HtmlRenderer(writer);
        Pipeline.Setup(renderer);
        renderer.Render(document);
        writer.Flush();
        return writer.ToString();
    }

    private static bool IsSafeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;

        var trimmed = url.Trim();
        var colon = trimmed.IndexOf(':');
        if (colon < 0) return true;                       // relative: /docs, ./a.png, #anchor

        // A colon that appears after a slash or a question mark is part of a path or a
        // query, not a scheme: "docs/a:b" is relative.
        var slash = trimmed.IndexOfAny(['/', '?', '#']);
        if (slash >= 0 && slash < colon) return true;

        var scheme = trimmed[..colon];
        return AllowedSchemes.Contains(scheme, StringComparer.OrdinalIgnoreCase);
    }
}
