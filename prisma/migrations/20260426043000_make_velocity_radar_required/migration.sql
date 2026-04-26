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
    "velocityRadarImageUrl" TEXT NOT NULL,
    "showReflectivity" BOOLEAN NOT NULL DEFAULT true,
    "showVelocity" BOOLEAN NOT NULL DEFAULT false,
    "nextUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AutoRadarMessage" (
    "channelId",
    "guildId",
    "id",
    "location",
    "messageId",
    "nextUpdate",
    "radarImageUrl",
    "radarStation",
    "showReflectivity",
    "showVelocity",
    "snowflake",
    "velocityRadarImageUrl"
)
SELECT
    "channelId",
    "guildId",
    "id",
    "location",
    "messageId",
    "nextUpdate",
    "radarImageUrl",
    "radarStation",
    "showReflectivity",
    "showVelocity",
    "snowflake",
    COALESCE(
        "velocityRadarImageUrl",
        'https://radar.weather.gov/ridge/standard/base_velocity/' || "radarStation" || '_loop.gif'
    )
FROM "AutoRadarMessage";
DROP TABLE "AutoRadarMessage";
ALTER TABLE "new_AutoRadarMessage" RENAME TO "AutoRadarMessage";
CREATE UNIQUE INDEX "AutoRadarMessage_snowflake_key" ON "AutoRadarMessage"("snowflake");
CREATE UNIQUE INDEX "AutoRadarMessage_messageId_key" ON "AutoRadarMessage"("messageId");
CREATE INDEX "AutoRadarMessage_guildId_nextUpdate_idx" ON "AutoRadarMessage"("guildId", "nextUpdate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
