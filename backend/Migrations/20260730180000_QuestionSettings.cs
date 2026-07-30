using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <summary>
    /// Seeds the tg.question.dow and tg.question.hour settings.
    ///
    /// Thursday 11:00 Almaty time – a different day from the Tuesday dilemma,
    /// so the two don't collide and each gets its own attention window.
    ///
    /// ON CONFLICT DO NOTHING guards against an operator who already created
    /// these rows through /set or the API before this migration reached production.
    /// </summary>
    public partial class QuestionSettings : Migration
    {
        private static readonly (string Key, string Value)[] Defaults =
        [
            ("tg.question.dow", "4"),       // Thursday
            ("tg.question.hour", "11"),     // 11:00 Almaty
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var (key, value) in Defaults)
            {
                migrationBuilder.Sql($"""
                    INSERT INTO "Settings" ("Key", "Value", "UpdatedAt")
                    VALUES ('{key}', '{value}', now())
                    ON CONFLICT ("Key") DO NOTHING;
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var (key, _) in Defaults)
            {
                migrationBuilder.Sql($"""DELETE FROM "Settings" WHERE "Key" = '{key}';""");
            }
        }
    }
}
