-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RadarChannel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL
);
INSERT INTO "new_RadarChannel" ("channelId", "guildId", "id", "location", "messageId", "radarImageUrl", "radarStation", "uuid") SELECT "channelId", "guildId", "id", "location", "messageId", "radarImageUrl", "radarStation", "uuid" FROM "RadarChannel";
DROP TABLE "RadarChannel";
ALTER TABLE "new_RadarChannel" RENAME TO "RadarChannel";
CREATE UNIQUE INDEX "RadarChannel_uuid_key" ON "RadarChannel"("uuid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
