using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeamleadsBackend.Migrations
{
    /// <inheritdoc />
    public partial class OutboxChatSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Written by hand: the model snapshot already carried this column (it was
            // briefly part of the Outbox migration), so `migrations add` saw no diff.
            // Production applied Outbox without it, hence this follow-up.
            migrationBuilder.AddColumn<string>(
                name: "ChatSetting",
                table: "Outbox",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ChatSetting", table: "Outbox");
        }
    }
}
