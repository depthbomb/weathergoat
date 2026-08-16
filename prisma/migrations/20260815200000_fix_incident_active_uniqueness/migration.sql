-- Replace status-wide uniqueness with uniqueness limited to active incidents. Resolved incidents
-- remain as history, while duplicate active incidents for the same key are still prevented.
DROP INDEX "Incident_key_status_key";

CREATE UNIQUE INDEX "Incident_active_key_key"
ON "Incident"("key")
WHERE "status" = 'ACTIVE';
