CREATE TABLE "AlertDeliveryClaim" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alertId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL,
    "messageId" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AlertDeliveryClaim_alertId_guildId_channelId_key" ON "AlertDeliveryClaim"("alertId", "guildId", "channelId");
CREATE INDEX "AlertDeliveryClaim_finalized_messageId_idx" ON "AlertDeliveryClaim"("finalized", "messageId");
CREATE INDEX "AlertDeliveryClaim_expiresAt_idx" ON "AlertDeliveryClaim"("expiresAt");
