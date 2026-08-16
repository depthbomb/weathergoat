ALTER TABLE "AlertDestination" ADD COLUMN "expiresAt" DATETIME;

CREATE INDEX "AlertDestination_expiresAt_idx" ON "AlertDestination"("expiresAt");
