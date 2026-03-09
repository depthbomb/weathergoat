/*
  Warnings:

  - You are about to drop the column `json` on the `SentAlert` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SentAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alertId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL
);
INSERT INTO "new_SentAlert" ("alertId", "channelId", "guildId", "id", "messageId") SELECT "alertId", "channelId", "guildId", "id", "messageId" FROM "SentAlert";
DROP TABLE "SentAlert";
ALTER TABLE "new_SentAlert" RENAME TO "SentAlert";
CREATE INDEX "SentAlert_guildId_channelId_alertId_idx" ON "SentAlert"("guildId", "channelId", "alertId");
CREATE UNIQUE INDEX "SentAlert_alertId_guildId_channelId_key" ON "SentAlert"("alertId", "guildId", "channelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
