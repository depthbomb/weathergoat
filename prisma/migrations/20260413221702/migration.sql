/*
  Warnings:

  - Added the required column `key` to the `Incident` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Incident" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snowflake" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "severity" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoResolveAt" DATETIME,
    "resolvedAt" DATETIME
);
INSERT INTO "new_Incident" ("autoResolveAt", "createdAt", "description", "id", "resolvedAt", "severity", "snowflake", "status", "title") SELECT "autoResolveAt", "createdAt", "description", "id", "resolvedAt", "severity", "snowflake", "status", "title" FROM "Incident";
DROP TABLE "Incident";
ALTER TABLE "new_Incident" RENAME TO "Incident";
CREATE UNIQUE INDEX "Incident_snowflake_key" ON "Incident"("snowflake");
CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");
CREATE UNIQUE INDEX "Incident_key_status_key" ON "Incident"("key", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
