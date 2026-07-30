using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <summary>
    /// Seeds the Settings table with the catalog defaults.
    ///
    /// A migration rather than startup code: it runs once, in order, right after the
    /// migration that created the table, and it leaves a version trail. The cost is that
    /// a new key in SettingsCatalog now needs its own migration – SettingsService falls
    /// back to the catalog default for anything unseeded, so forgetting one changes no
    /// behaviour, it only means the row is missing from `/set` until someone adds it.
    ///
    /// ON CONFLICT DO NOTHING guards against a row that already exists (someone PUT the
    /// setting before this migration reached production): a primary-key clash here would
    /// fail the startup migration and put the container in a restart loop.
    /// </summary>
    public partial class SeedSettings : Migration
    {
        private static readonly (string Key, string Value)[] Defaults =
        [
            // Real ids, seeded so a fresh database is usable without a manual step.
            // Admin is a positive id => a private chat with one person, not a group.
            // Community carries the -100 supergroup prefix the Bot API expects.
            ("tg.admin_chat_id", "5326508454"),
            ("tg.community_chat_id", "-1002424547330"),
            ("tg.scheduler.enabled", "false"),
            ("tg.dilemma.dow", "2"),
            ("tg.dilemma.hour", "11"),
            ("tg.dilemma.reveal_hours", "24"),
            ("anon.max_pending_per_author", "5"),
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
            // Removes the seeded keys, including any operator edits to them: there is no
            // way to tell an edited seed row from an untouched one, and leaving rows
            // behind would make a re-apply of Up a silent no-op.
            var keys = string.Join(", ", Defaults.Select(d => $"'{d.Key}'"));
            migrationBuilder.Sql($"""DELETE FROM "Settings" WHERE "Key" IN ({keys});""");
        }
    }
}
