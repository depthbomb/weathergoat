-- DropIndex
DROP INDEX "SentAlert_alertId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_alertId_guildId_channelId_key" ON "SentAlert"("alertId", "guildId", "channelId");
