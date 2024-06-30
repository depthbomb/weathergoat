/*
  Warnings:

  - You are about to drop the column `uuid` on the `AutoRadarMessage` table. All the data in the column will be lost.
  - You are about to drop the column `uuid` on the `ForecastDestination` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "AutoRadarMessage_uuid_key";

-- DropIndex
DROP INDEX "ForecastDestination_uuid_key";

-- AlterTable
ALTER TABLE "AutoRadarMessage" DROP COLUMN "uuid";

-- AlterTable
ALTER TABLE "ForecastDestination" DROP COLUMN "uuid";
