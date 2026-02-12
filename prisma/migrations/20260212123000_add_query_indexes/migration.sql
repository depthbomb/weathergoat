-- CreateIndex
CREATE INDEX "AlertDestination_guildId_idx" ON "AlertDestination"("guildId");

-- CreateIndex
CREATE INDEX "AutoRadarMessage_guildId_idx" ON "AutoRadarMessage"("guildId");

-- CreateIndex
CREATE INDEX "ForecastDestination_guildId_idx" ON "ForecastDestination"("guildId");

-- CreateIndex
CREATE INDEX "SentAlert_guildId_channelId_alertId_idx" ON "SentAlert"("guildId", "channelId", "alertId");

-- CreateIndex
CREATE INDEX "VolatileMessage_guildId_idx" ON "VolatileMessage"("guildId");

-- CreateIndex
CREATE INDEX "VolatileMessage_expiresAt_idx" ON "VolatileMessage"("expiresAt");
