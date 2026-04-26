/*
  Warnings:

  - You are about to drop the column `channelId` on the `AnnouncementSubscription` table. All the data in the column will be lost.
  - You are about to drop the column `guildId` on the `AnnouncementSubscription` table. All the data in the column will be lost.
  - Added the required column `userId` to the `AnnouncementSubscription` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnouncementSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AnnouncementSubscription" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "AnnouncementSubscription";
DROP TABLE "AnnouncementSubscription";
ALTER TABLE "new_AnnouncementSubscription" RENAME TO "AnnouncementSubscription";
CREATE UNIQUE INDEX "AnnouncementSubscription_userId_key" ON "AnnouncementSubscription"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
