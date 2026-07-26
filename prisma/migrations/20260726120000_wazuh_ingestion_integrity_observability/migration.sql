-- Phase 6a: additive observability columns for Wazuh ingestion integrity.
-- Does not alter checkpoint values (lastTimestamp / lastDocumentId).

ALTER TABLE "WazuhIngestionState"
  ADD COLUMN IF NOT EXISTS "lastSyncSkippedMalformed" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastSyncRetries" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastFailedSyncAt" TIMESTAMP(3);
