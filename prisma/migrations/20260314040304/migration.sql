/*
  Warnings:

  - A unique constraint covering the columns `[guildId]` on the table `AnnouncementSubscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[channelId]` on the table `AnnouncementSubscription` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AnnouncementSubscription_guildId_channelId_key";

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementSubscription_guildId_key" ON "AnnouncementSubscription"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementSubscription_channelId_key" ON "AnnouncementSubscription"("channelId");
