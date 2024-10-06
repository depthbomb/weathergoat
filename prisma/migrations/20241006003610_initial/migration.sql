-- CreateTable
CREATE TABLE "AlertDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT,
    "pingOnSevere" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "AutoRadarMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ForecastDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "radarImageUrl" TEXT
);

-- CreateTable
CREATE TABLE "SentAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alertId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "json" TEXT
);

-- CreateTable
CREATE TABLE "VolatileMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertDestination_snowflake_key" ON "AlertDestination"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRadarMessage_snowflake_key" ON "AutoRadarMessage"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRadarMessage_messageId_key" ON "AutoRadarMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_snowflake_key" ON "ForecastDestination"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_messageId_key" ON "ForecastDestination"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_alertId_key" ON "SentAlert"("alertId");

-- CreateIndex
CREATE UNIQUE INDEX "VolatileMessage_messageId_key" ON "VolatileMessage"("messageId");
