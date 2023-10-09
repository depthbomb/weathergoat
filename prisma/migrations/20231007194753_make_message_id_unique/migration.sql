/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `VolatileMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "VolatileMessage_messageId_key" ON "VolatileMessage"("messageId");
