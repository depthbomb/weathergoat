/*
  Warnings:

  - You are about to drop the column `autoCleanup` on the `ForecastDestination` table. All the data in the column will be lost.
  - Added the required column `messageId` to the `ForecastDestination` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ForecastDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "radarImageUrl" TEXT
);
INSERT INTO "new_ForecastDestination" ("channelId", "guildId", "id", "latitude", "longitude", "radarImageUrl", "uuid") SELECT "channelId", "guildId", "id", "latitude", "longitude", "radarImageUrl", "uuid" FROM "ForecastDestination";
DROP TABLE "ForecastDestination";
ALTER TABLE "new_ForecastDestination" RENAME TO "ForecastDestination";
CREATE UNIQUE INDEX "ForecastDestination_uuid_key" ON "ForecastDestination"("uuid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
