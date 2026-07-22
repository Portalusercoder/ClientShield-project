-- Security event classification + Wazuh noise/sync infrastructure

CREATE TYPE "SecurityEventClassification" AS ENUM (
  'ACTIONABLE',
  'INFORMATIONAL',
  'NOISY',
  'IGNORED'
);

CREATE TYPE "WazuhProcessedDisposition" AS ENUM (
  'EVENT_CREATED',
  'EVENT_CORRELATED',
  'FILTERED_LEVEL',
  'FILTERED_DENYLIST',
  'FILTERED_ALLOWLIST',
  'MALFORMED',
  'DUPLICATE'
);

ALTER TABLE "SecurityEvent"
  ADD COLUMN IF NOT EXISTS "classification" "SecurityEventClassification" NOT NULL DEFAULT 'ACTIONABLE',
  ADD COLUMN IF NOT EXISTS "scaCheckId" TEXT;

CREATE INDEX IF NOT EXISTS "SecurityEvent_classification_idx" ON "SecurityEvent"("classification");
CREATE INDEX IF NOT EXISTS "SecurityEvent_organizationId_classification_idx" ON "SecurityEvent"("organizationId", "classification");

-- Migrate Omar MacBook Dev from SERVER → WORKSTATION only (preserve other SERVER assets)
UPDATE "Asset"
SET "type" = 'WORKSTATION'::"AssetType",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Omar MacBook Dev'
  AND "type" = 'SERVER'::"AssetType";

ALTER TABLE "WazuhIngestionState"
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "workerId" TEXT,
  ADD COLUMN IF NOT EXISTS "workerLastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSyncDurationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncProcessed" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncCreated" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncUpdated" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncFiltered" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncIgnored" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncSkippedDuplicates" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncErrors" INTEGER;

ALTER TABLE "WazuhProcessedAlert"
  ADD COLUMN IF NOT EXISTS "disposition" "WazuhProcessedDisposition",
  ADD COLUMN IF NOT EXISTS "filterReason" TEXT;

CREATE INDEX IF NOT EXISTS "WazuhProcessedAlert_organizationId_createdAt_idx"
  ON "WazuhProcessedAlert"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WazuhProcessedAlert_disposition_idx"
  ON "WazuhProcessedAlert"("disposition");
