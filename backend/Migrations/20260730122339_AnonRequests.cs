using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <inheritdoc />
    public partial class AnonRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnonRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PublicId = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Text = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    EditedText = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AuthorHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AdminMessageId = table.Column<long>(type: "bigint", nullable: true),
                    ModeratedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ModeratedByTgId = table.Column<long>(type: "bigint", nullable: true),
                    PublishedMessageId = table.Column<long>(type: "bigint", nullable: true),
                    RejectReason = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnonRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnonRequests_AuthorHash",
                table: "AnonRequests",
                column: "AuthorHash");

            migrationBuilder.CreateIndex(
                name: "IX_AnonRequests_CreatedAt",
                table: "AnonRequests",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_AnonRequests_PublicId",
                table: "AnonRequests",
                column: "PublicId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnonRequests_Status",
                table: "AnonRequests",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnonRequests");
        }
    }
}
