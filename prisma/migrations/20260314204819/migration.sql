-- CreateTable
CREATE TABLE "AnnouncementDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "announcementId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AnnouncementSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Announcement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Announcement" ("body", "color", "createdAt", "id", "snowflake", "title", "updatedAt") SELECT "body", "color", "createdAt", "id", "snowflake", "title", "updatedAt" FROM "Announcement";
DROP TABLE "Announcement";
ALTER TABLE "new_Announcement" RENAME TO "Announcement";
CREATE UNIQUE INDEX "Announcement_snowflake_key" ON "Announcement"("snowflake");
CREATE TABLE "new_AnnouncementSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AnnouncementSubscription" ("channelId", "createdAt", "guildId", "id", "updatedAt") SELECT "channelId", "createdAt", "guildId", "id", "updatedAt" FROM "AnnouncementSubscription";
DROP TABLE "AnnouncementSubscription";
ALTER TABLE "new_AnnouncementSubscription" RENAME TO "AnnouncementSubscription";
CREATE UNIQUE INDEX "AnnouncementSubscription_guildId_key" ON "AnnouncementSubscription"("guildId");
CREATE TABLE "new_FeedbackBan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FeedbackBan" ("active", "createdAt", "id", "reason", "updatedAt", "userId") SELECT "active", "createdAt", "id", "reason", "updatedAt", "userId" FROM "FeedbackBan";
DROP TABLE "FeedbackBan";
ALTER TABLE "new_FeedbackBan" RENAME TO "FeedbackBan";
CREATE UNIQUE INDEX "FeedbackBan_userId_key" ON "FeedbackBan"("userId");
CREATE INDEX "FeedbackBan_userId_idx" ON "FeedbackBan"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_announcementId_idx" ON "AnnouncementDelivery"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_subscriptionId_idx" ON "AnnouncementDelivery"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_subscriptionId_key" ON "AnnouncementDelivery"("announcementId", "subscriptionId");
