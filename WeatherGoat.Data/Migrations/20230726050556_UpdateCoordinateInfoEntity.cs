using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WeatherGoat.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateCoordinateInfoEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CountyId",
                table: "CoordinateInfo",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RadarImageUrl",
                table: "CoordinateInfo",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ZoneId",
                table: "CoordinateInfo",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CountyId",
                table: "CoordinateInfo");

            migrationBuilder.DropColumn(
                name: "RadarImageUrl",
                table: "CoordinateInfo");

            migrationBuilder.DropColumn(
                name: "ZoneId",
                table: "CoordinateInfo");
        }
    }
}
