-- CreateTable
CREATE TABLE "AlertDestination" (
    "id" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT,
    "pingOnSevere" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AlertDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoRadarMessage" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "location" TEXT NOT NULL,
    "radarStation" TEXT NOT NULL,
    "radarImageUrl" TEXT NOT NULL,

    CONSTRAINT "AutoRadarMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastDestination" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "radarImageUrl" TEXT,

    CONSTRAINT "ForecastDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentAlert" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "json" TEXT,

    CONSTRAINT "SentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolatileMessage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolatileMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoRadarMessage_uuid_key" ON "AutoRadarMessage"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_uuid_key" ON "ForecastDestination"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_messageId_key" ON "ForecastDestination"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_alertId_key" ON "SentAlert"("alertId");
