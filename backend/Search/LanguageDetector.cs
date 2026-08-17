using System.Text.RegularExpressions;

namespace TeamleadsBackend.Search;

// Heuristic language detection for paste syntax highlighting.
//
// Checks the first 20 lines for common patterns (shebangs, keywords, structure)
// and falls back to a "code vs prose" heuristic when nothing matches.
//
// Returns a highlight.js language class name: "go", "python", "json", "yaml",
// "sql", "rust", "bash", "markdown", "plaintext" (undetermined code), or "text" (prose).
public static partial class LanguageDetector
{
    public static string Detect(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return "text";

        var lines = content.Replace("\r\n", "\n").Split('\n');
        var firstLine = lines[0].TrimStart();
        var sample = string.Join("\n", lines.Take(20)).Trim();

        // Shebangs
        if (firstLine.StartsWith("#!"))
        {
            var shebang = firstLine.ToLowerInvariant();
            if (shebang.Contains("python") || shebang.Contains("python3")) return "python";
            if (shebang.Contains("bash") || shebang.Contains("sh")) return "bash";
            if (shebang.Contains("node")) return "javascript";
            return "bash";
        }

        // Structural patterns (order matters – more specific first)
        if (Regex.IsMatch(sample, @"^\s*\{[\s]*""\w+""\s*:", RegexOptions.Multiline)
            || (sample.TrimStart().StartsWith('{') && sample.Contains("\":")))
            return "json";

        if (Regex.IsMatch(sample, @"^\s*\[[\s]*\{[\s]*""\w+""\s*:", RegexOptions.Multiline))
            return "json";

        // YAML: top-level key: value pairs, no braces, no semicolons
        if (Regex.IsMatch(sample, @"^[\w.-]+:\s", RegexOptions.Multiline)
            && !sample.Contains('{')
            && !sample.Contains('}')
            && !Regex.IsMatch(sample, @"\bfunc\b|\bclass\b|\bdef\b|\bimport\b|\bpackage\b")
            && CountMatches(sample, @"^[\w.-]+:\s", RegexOptions.Multiline) >= 3)
            return "yaml";

        // Markdown. Deliberately after JSON and YAML – a config file with "# comment"
        // and "- item" lines looks a little like a document, and misreading one as prose
        // is worse than missing a heading. Deliberately before the language rules below,
        // so a README full of ```bash fences is a document and not a shell script.
        if (LooksLikeMarkdown(sample)) return "markdown";

        // SQL
        if (Regex.IsMatch(sample, @"\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b",
                RegexOptions.IgnoreCase))
            return "sql";

        // Go
        if (Regex.IsMatch(sample, @"^\s*package\s+\w+", RegexOptions.Multiline)
            && Regex.IsMatch(sample, @"\bfunc\b|\bvar\b\w+\s+[\w.]+|\bimport\s+[""]"))
            return "go";

        // Rust
        if (Regex.IsMatch(sample, @"\bfn\s+\w+\s*\([^)]*\)\s*(->\s*\w+)?\s*\{"))
        {
            if (Regex.IsMatch(sample, @"\blet\s+mut\b|\buse\s+\w+::|:\s*&?\w+\s*\{"))
                return "rust";
        }

        // Python
        if (Regex.IsMatch(sample, @"\bdef\s+\w+\s*\([^)]*\)\s*:"))
            return "python";
        if (Regex.IsMatch(sample, @"^\s*(import\s+\w+|from\s+\w+\s+import)", RegexOptions.Multiline)
            && !sample.Contains(';')
            && !sample.Contains("package "))
            return "python";

        // Bash / shell
        if (Regex.IsMatch(sample, @"^\s*(export\s+\w+=|source\s+|\.\/\w+|apt\s+|yum\s+|brew\s+|docker\s+|kubectl\s+|git\s+)",
                RegexOptions.Multiline))
            return "bash";

        // Code vs prose heuristic: count special characters
        var specialCharRatio = (double)CountMatches(sample, @"[{}\[\]()=;:<>|&!@#$%^*]") / Math.Max(1, sample.Length);
        var lineCount = lines.Length;
        var avgLineLength = lineCount > 0 ? (double)sample.Length / lineCount : 0;

        // Long lines + many special chars = likely code
        if (specialCharRatio > 0.04 || avgLineLength > 80)
            return "plaintext";

        // JSON-like patterns
        if (sample.Contains('{') && (sample.Contains("\":") || sample.Contains("\": ")))
            return "json";

        return "text";
    }

    // Markdown has no keyword to look for – only punctuation that also occurs in prose
    // and in config files. So: count independent signals and ask for two. A fenced code
    // block or a pipe table is specific enough to count on its own, because neither
    // shows up by accident in anything else people paste here.
    private static bool LooksLikeMarkdown(string sample)
    {
        if (Regex.IsMatch(sample, @"^```", RegexOptions.Multiline)) return true;
        if (Regex.IsMatch(sample, @"^\|.*\|\s*$", RegexOptions.Multiline)
            && Regex.IsMatch(sample, @"^\|?[\s:|-]*-{3,}[\s:|-]*$", RegexOptions.Multiline))
            return true;

        var signals = 0;
        // "# Заголовок", not a bare "#" and not a "#!" shebang or a "#tag".
        if (Regex.IsMatch(sample, @"^#{1,6} \S", RegexOptions.Multiline)) signals++;
        if (Regex.IsMatch(sample, @"^\s*([-*+]|\d+\.) \S", RegexOptions.Multiline)) signals++;
        if (Regex.IsMatch(sample, @"!?\[[^\]\n]+\]\([^)\n]+\)")) signals++;
        if (Regex.IsMatch(sample, @"\*\*\S[^*\n]*\S\*\*|__\S[^_\n]*\S__")) signals++;
        if (Regex.IsMatch(sample, @"^> \S", RegexOptions.Multiline)) signals++;

        return signals >= 2;
    }

    private static int CountMatches(string input, string pattern, RegexOptions options = RegexOptions.None)
        => Regex.Matches(input, pattern, options).Count;

    public static string HighlightCssClass(string language) => language switch
    {
        "text" => "nohighlight",
        "plaintext" => "nohighlight",
        _ => $"language-{language}",
    };
}
