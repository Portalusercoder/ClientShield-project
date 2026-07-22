-- Data migrations that use enum values added in the previous migration.
-- Must run in a separate migration so PostgreSQL can see newly committed enum values.

-- Migrate ACCEPTED -> ACCEPTED_RISK (legacy enum value remains unused)
UPDATE "Finding"
SET "status" = 'ACCEPTED_RISK'
WHERE "status"::text = 'ACCEPTED';

-- Migrate DEFERRED -> BLOCKED where applicable
UPDATE "RemediationTask"
SET "status" = 'BLOCKED'
WHERE "status"::text = 'DEFERRED';
