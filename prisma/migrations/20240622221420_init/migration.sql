-- CreateTable
CREATE TABLE "AlertDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
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
CREATE TABLE "ForecastDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT
);

-- CreateTable
CREATE TABLE "RadarChannel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL
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
CREATE UNIQUE INDEX "AlertDestination_uuid_key" ON "AlertDestination"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_uuid_key" ON "ForecastDestination"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "RadarChannel_uuid_key" ON "RadarChannel"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_alertId_key" ON "SentAlert"("alertId");
