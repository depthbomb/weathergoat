-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutoRadarMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL,
    "nextUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AutoRadarMessage" ("channelId", "guildId", "id", "location", "messageId", "radarImageUrl", "radarStation", "snowflake") SELECT "channelId", "guildId", "id", "location", "messageId", "radarImageUrl", "radarStation", "snowflake" FROM "AutoRadarMessage";
DROP TABLE "AutoRadarMessage";
ALTER TABLE "new_AutoRadarMessage" RENAME TO "AutoRadarMessage";
CREATE UNIQUE INDEX "AutoRadarMessage_snowflake_key" ON "AutoRadarMessage"("snowflake");
CREATE UNIQUE INDEX "AutoRadarMessage_messageId_key" ON "AutoRadarMessage"("messageId");
CREATE INDEX "AutoRadarMessage_guildId_idx" ON "AutoRadarMessage"("guildId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
