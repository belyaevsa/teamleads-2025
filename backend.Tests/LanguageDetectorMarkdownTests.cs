using TeamleadsBackend.Search;
using Xunit;

namespace TeamleadsBackend.Tests;

// Markdown is the one language here that gets rendered instead of highlighted, so a
// false positive is louder than the rest: a shell script mistaken for a document loses
// its line breaks and its monospace. The detector therefore asks for two independent
// markdown signals, or one that nothing else produces (a fence, a pipe table).
public class LanguageDetectorMarkdownTests
{
    [Theory]
    [InlineData("# Постмортем\n\n- сервис лег в 14:20\n- подняли в 14:35\n")]
    [InlineData("## Что решили\n\nПодробности в [тикете](https://example.com/1).\n")]
    [InlineData("Заметка\n\n```bash\ndocker ps\n```\n")]
    [InlineData("| ключ | значение |\n|------|----------|\n| a    | 1        |\n")]
    [InlineData("> Цитата из чата\n\n**Вывод:** так делать не надо\n")]
    // A transcript: heading, italic subtitle, a rule, then long paragraphs of prose.
    [InlineData("# Голосовое сообщение\n\n*Расшифровка, около 8 минут.*\n\n---\n\nНу, в общем, я периодически занимаюсь реверс-инжинирингом.\n")]
    // Only section headings, the rest is plain paragraphs.
    [InlineData("## Как проверяли подрядчика\n\nПроверку проводили несколько раз.\n\n## Что сделал хакер\n\nДали ему неделю.\n")]
    public void Documents_are_detected_as_markdown(string content)
        => Assert.Equal("markdown", LanguageDetector.Detect(content));

    [Theory]
    // A single heading-looking line is a comment in half the languages people paste.
    [InlineData("# build the image\ndocker build -t app .\ndocker push app\n")]
    [InlineData("services:\n  api:\n    image: app\n    ports:\n      - 8080:8080\n")]
    [InlineData("{\n  \"name\": \"app\",\n  \"version\": \"1.0\"\n}\n")]
    [InlineData("SELECT id, name FROM users WHERE active = true;\n")]
    [InlineData("def main():\n    print(1)\n")]
    [InlineData("# clean up\nrm -rf *tmp* build_dir_old\n")]
    [InlineData("# app config\n---\nname: app\n")]
    [InlineData("# build\ndocker build -t app .\n\n# push\ndocker push app\n")]
    public void Code_and_config_are_not_mistaken_for_markdown(string content)
        => Assert.NotEqual("markdown", LanguageDetector.Detect(content));

    [Fact]
    public void Markdown_gets_a_highlight_class_for_the_source_view()
        => Assert.Equal("language-markdown", LanguageDetector.HighlightCssClass("markdown"));
}
