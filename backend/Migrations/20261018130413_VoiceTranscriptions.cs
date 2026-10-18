using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <summary>
    /// The job table behind /paste on a voice message, and the voice.* settings.
    ///
    /// voice.chats is seeded with the community chat, so turning the feature on is one
    /// `/set voice.enabled true` – it stays off until then. ON CONFLICT DO NOTHING for the
    /// same reason as SeedSettings: a row an operator already created must not fail the
    /// startup migration.
    /// </summary>
    public partial class VoiceTranscriptions : Migration
    {
        private static readonly (string Key, string Value)[] Defaults =
        [
            ("voice.enabled", "false"),
            ("voice.chats", "-1002424547330"),     // the community supergroup
            ("voice.max_minutes", "15"),
            ("voice.stt_model", "microsoft/mai-transcribe-2"),
            ("voice.llm_model", "deepseek/deepseek-v4.1-flash"),
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

            migrationBuilder.CreateTable(
                name: "VoiceTranscriptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FileUniqueId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FileId = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    ChatId = table.Column<long>(type: "bigint", nullable: false),
                    VoiceMessageId = table.Column<long>(type: "bigint", nullable: false),
                    StatusMessageId = table.Column<long>(type: "bigint", nullable: false),
                    AuthorName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    AuthorTgId = table.Column<long>(type: "bigint", nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    PastePublicId = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                    LastError = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CostUsd = table.Column<decimal>(type: "numeric(12,6)", precision: 12, scale: 6, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VoiceTranscriptions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VoiceTranscriptions_FileUniqueId",
                table: "VoiceTranscriptions",
                column: "FileUniqueId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VoiceTranscriptions_Status_NextAttemptAt",
                table: "VoiceTranscriptions",
                columns: new[] { "Status", "NextAttemptAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var (key, _) in Defaults)
            {
                migrationBuilder.Sql($"""DELETE FROM "Settings" WHERE "Key" = '{key}';""");
            }

            migrationBuilder.DropTable(
                name: "VoiceTranscriptions");
        }
    }
}
