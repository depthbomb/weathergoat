/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `FeedbackBan` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FeedbackBan_userId_key" ON "FeedbackBan"("userId");
