using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <inheritdoc />
    public partial class SimAnswers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Tally",
                table: "BotPosts",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SimAnswers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ScenarioId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    OptionIndex = table.Column<int>(type: "integer", nullable: false),
                    OptionsKey = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ClientHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SimAnswers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SimAnswers_ScenarioId_ClientHash",
                table: "SimAnswers",
                columns: new[] { "ScenarioId", "ClientHash" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SimAnswers");

            migrationBuilder.DropColumn(
                name: "Tally",
                table: "BotPosts");
        }
    }
}
