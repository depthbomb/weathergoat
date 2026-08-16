-- Add bounded retention for sent-alert deduplication records. Existing records associated with
-- auto-cleanup messages retain their precise expiry; other legacy records receive a grace period
-- so currently active alerts are not replayed immediately after deployment.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SentAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alertId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

INSERT INTO "new_SentAlert" (
    "alertId",
    "channelId",
    "expiresAt",
    "guildId",
    "id",
    "messageId"
)
SELECT
    sent."alertId",
    sent."channelId",
    COALESCE(
        (
            SELECT volatile."expiresAt"
            FROM "VolatileMessage" AS volatile
            WHERE volatile."messageId" = sent."messageId"
        ),
        datetime('now', '+30 days')
    ),
    sent."guildId",
    sent."id",
    sent."messageId"
FROM "SentAlert" AS sent;

DROP TABLE "SentAlert";
ALTER TABLE "new_SentAlert" RENAME TO "SentAlert";

CREATE UNIQUE INDEX "SentAlert_alertId_guildId_channelId_key"
ON "SentAlert"("alertId", "guildId", "channelId");

CREATE INDEX "SentAlert_guildId_channelId_alertId_idx"
ON "SentAlert"("guildId", "channelId", "alertId");

CREATE INDEX "SentAlert_expiresAt_idx"
ON "SentAlert"("expiresAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
