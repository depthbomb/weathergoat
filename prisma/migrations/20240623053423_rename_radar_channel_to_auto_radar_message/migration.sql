/*
  Warnings:

  - You are about to drop the `RadarChannel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RadarChannel";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AutoRadarMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoRadarMessage_uuid_key" ON "AutoRadarMessage"("uuid");
