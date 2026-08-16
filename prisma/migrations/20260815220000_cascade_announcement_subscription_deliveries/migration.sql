-- Allow unsubscribing after deliveries have been created. Removing a subscription also
-- cancels its pending deliveries and removes its completed delivery history.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AnnouncementDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "announcementId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AnnouncementSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_AnnouncementDelivery" (
    "announcementId",
    "attemptCount",
    "createdAt",
    "error",
    "failedAt",
    "id",
    "nextAttemptAt",
    "sentAt",
    "subscriptionId"
)
SELECT
    "announcementId",
    "attemptCount",
    "createdAt",
    "error",
    "failedAt",
    "id",
    "nextAttemptAt",
    "sentAt",
    "subscriptionId"
FROM "AnnouncementDelivery";

DROP TABLE "AnnouncementDelivery";
ALTER TABLE "new_AnnouncementDelivery" RENAME TO "AnnouncementDelivery";

CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_subscriptionId_key"
ON "AnnouncementDelivery"("announcementId", "subscriptionId");

CREATE INDEX "AnnouncementDelivery_announcementId_idx"
ON "AnnouncementDelivery"("announcementId");

CREATE INDEX "AnnouncementDelivery_subscriptionId_idx"
ON "AnnouncementDelivery"("subscriptionId");

CREATE INDEX "AnnouncementDelivery_sentAt_nextAttemptAt_idx"
ON "AnnouncementDelivery"("sentAt", "nextAttemptAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
