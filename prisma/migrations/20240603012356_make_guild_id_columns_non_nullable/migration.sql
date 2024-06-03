/*
  Warnings:

  - Made the column `guildId` on table `AlertDestination` required. This step will fail if there are existing NULL values in that column.
  - Made the column `guildId` on table `ForecastDestination` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertDestination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT,
    "pingOnSevere" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_AlertDestination" ("autoCleanup", "channelId", "countyId", "guildId", "id", "latitude", "longitude", "pingOnSevere", "radarImageUrl", "zoneId") SELECT "autoCleanup", "channelId", "countyId", "guildId", "id", "latitude", "longitude", "pingOnSevere", "radarImageUrl", "zoneId" FROM "AlertDestination";
DROP TABLE "AlertDestination";
ALTER TABLE "new_AlertDestination" RENAME TO "AlertDestination";
CREATE TABLE "new_ForecastDestination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT
);
INSERT INTO "new_ForecastDestination" ("autoCleanup", "channelId", "guildId", "id", "latitude", "longitude", "radarImageUrl") SELECT "autoCleanup", "channelId", "guildId", "id", "latitude", "longitude", "radarImageUrl" FROM "ForecastDestination";
DROP TABLE "ForecastDestination";
ALTER TABLE "new_ForecastDestination" RENAME TO "ForecastDestination";
PRAGMA foreign_key_check("AlertDestination");
PRAGMA foreign_key_check("ForecastDestination");
PRAGMA foreign_keys=ON;
