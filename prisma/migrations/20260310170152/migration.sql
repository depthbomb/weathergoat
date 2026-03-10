-- DropIndex
DROP INDEX "AutoRadarMessage_guildId_idx";

-- CreateIndex
CREATE INDEX "AutoRadarMessage_guildId_nextUpdate_idx" ON "AutoRadarMessage"("guildId", "nextUpdate");
