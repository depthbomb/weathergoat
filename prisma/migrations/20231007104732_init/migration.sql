-- CreateTable
CREATE TABLE "AlertDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT
);

-- CreateTable
CREATE TABLE "ForecastDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "radarImageUrl" TEXT
);

-- CreateTable
CREATE TABLE "SentAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alertId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "VolatileMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertDestination_snowflake_key" ON "AlertDestination"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_snowflake_key" ON "ForecastDestination"("snowflake");

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_alertId_key" ON "SentAlert"("alertId");
