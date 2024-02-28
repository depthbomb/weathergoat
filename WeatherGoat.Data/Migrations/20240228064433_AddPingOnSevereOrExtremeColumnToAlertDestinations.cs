using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WeatherGoat.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPingOnSevereOrExtremeColumnToAlertDestinations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PingOnSevereOrExtreme",
                table: "AlertDestinations",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PingOnSevereOrExtreme",
                table: "AlertDestinations");
        }
    }
}
