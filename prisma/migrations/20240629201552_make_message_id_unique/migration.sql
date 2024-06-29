/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `ForecastDestination` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ForecastDestination_messageId_key" ON "ForecastDestination"("messageId");
