-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT
);
INSERT INTO "new_AlertDestination" (
    "autoCleanup",
    "channelId",
    "countyId",
    "guildId",
    "id",
    "latitude",
    "longitude",
    "radarImageUrl",
    "snowflake",
    "zoneId"
)
SELECT
    "autoCleanup",
    "channelId",
    "countyId",
    "guildId",
    "id",
    "latitude",
    "longitude",
    "radarImageUrl",
    "snowflake",
    "zoneId"
FROM "AlertDestination";
DROP TABLE "AlertDestination";
ALTER TABLE "new_AlertDestination" RENAME TO "AlertDestination";
CREATE UNIQUE INDEX "AlertDestination_snowflake_key" ON "AlertDestination"("snowflake");
CREATE INDEX "AlertDestination_guildId_idx" ON "AlertDestination"("guildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
