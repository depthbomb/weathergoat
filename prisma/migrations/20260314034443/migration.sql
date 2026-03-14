-- CreateTable
CREATE TABLE "Announcement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AnnouncementSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_snowflake_key" ON "Announcement"("snowflake");

-- CreateIndex
CREATE INDEX "Announcement_snowflake_idx" ON "Announcement"("snowflake");

-- CreateIndex
CREATE INDEX "AnnouncementSubscription_guildId_channelId_idx" ON "AnnouncementSubscription"("guildId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementSubscription_guildId_channelId_key" ON "AnnouncementSubscription"("guildId", "channelId");
