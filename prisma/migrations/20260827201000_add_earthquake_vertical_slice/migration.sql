-- CreateTable
CREATE TABLE "EarthquakeSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "radiusKm" REAL NOT NULL,
    "minMagnitude" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EarthquakeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUpdatedAt" DATETIME NOT NULL,
    "eventTime" DATETIME NOT NULL,
    "firstObservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "magnitude" REAL,
    "magnitudeType" TEXT,
    "place" TEXT,
    "status" TEXT,
    "eventType" TEXT,
    "longitude" REAL NOT NULL,
    "latitude" REAL NOT NULL,
    "depthKm" REAL NOT NULL,
    "significance" INTEGER,
    "felt" INTEGER,
    "tsunami" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "detailUrl" TEXT,
    "productMetadata" TEXT
);

-- CreateTable
CREATE TABLE "EarthquakeDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subscriptionId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "deliveredRevisionAt" DATETIME,
    "firstEligibleAt" DATETIME NOT NULL,
    "lastEligible" BOOLEAN NOT NULL DEFAULT true,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimExpiresAt" DATETIME,
    "deliveredAt" DATETIME,
    "failedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EarthquakeDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "EarthquakeSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EarthquakeDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EarthquakeEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EarthquakeIngestionState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastModified" TEXT,
    "lastGeneratedAt" DATETIME,
    "baselinedAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastFailureAt" DATETIME,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EarthquakeSubscription_snowflake_key" ON "EarthquakeSubscription"("snowflake");
CREATE INDEX "EarthquakeSubscription_guildId_idx" ON "EarthquakeSubscription"("guildId");
CREATE INDEX "EarthquakeSubscription_channelId_idx" ON "EarthquakeSubscription"("channelId");
CREATE UNIQUE INDEX "EarthquakeSubscription_guildId_channelId_latitude_longitude_radiusKm_minMagnitude_key" ON "EarthquakeSubscription"("guildId", "channelId", "latitude", "longitude", "radiusKm", "minMagnitude");
CREATE INDEX "EarthquakeEvent_eventTime_idx" ON "EarthquakeEvent"("eventTime");
CREATE INDEX "EarthquakeEvent_lastObservedAt_idx" ON "EarthquakeEvent"("lastObservedAt");
CREATE INDEX "EarthquakeEvent_magnitude_idx" ON "EarthquakeEvent"("magnitude");
CREATE UNIQUE INDEX "EarthquakeDelivery_messageId_key" ON "EarthquakeDelivery"("messageId");
CREATE INDEX "EarthquakeDelivery_state_nextAttemptAt_idx" ON "EarthquakeDelivery"("state", "nextAttemptAt");
CREATE INDEX "EarthquakeDelivery_claimExpiresAt_idx" ON "EarthquakeDelivery"("claimExpiresAt");
CREATE INDEX "EarthquakeDelivery_eventId_idx" ON "EarthquakeDelivery"("eventId");
CREATE UNIQUE INDEX "EarthquakeDelivery_subscriptionId_eventId_key" ON "EarthquakeDelivery"("subscriptionId", "eventId");
