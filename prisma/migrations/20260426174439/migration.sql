-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Guild/channel subscriptions cannot be converted to user subscriptions because the old records
-- do not identify the user who subscribed. Retire their pending delivery records before replacing
-- the subscription table so the new schema starts without invalid user IDs or orphaned rows.
DELETE FROM "AnnouncementDelivery"
WHERE "subscriptionId" IN (SELECT "id" FROM "AnnouncementSubscription");

CREATE TABLE "new_AnnouncementSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
DROP TABLE "AnnouncementSubscription";
ALTER TABLE "new_AnnouncementSubscription" RENAME TO "AnnouncementSubscription";
CREATE UNIQUE INDEX "AnnouncementSubscription_userId_key" ON "AnnouncementSubscription"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
