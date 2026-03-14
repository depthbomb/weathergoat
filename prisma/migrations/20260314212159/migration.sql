/*
  Warnings:

  - You are about to drop the column `color` on the `Announcement` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Announcement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Announcement" ("body", "createdAt", "id", "snowflake", "title", "updatedAt") SELECT "body", "createdAt", "id", "snowflake", "title", "updatedAt" FROM "Announcement";
DROP TABLE "Announcement";
ALTER TABLE "new_Announcement" RENAME TO "Announcement";
CREATE UNIQUE INDEX "Announcement_snowflake_key" ON "Announcement"("snowflake");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
