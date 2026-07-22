-- FindingStatus: add new values (data migration of ACCEPTED -> ACCEPTED_RISK is in the next migration)
ALTER TYPE "FindingStatus" ADD VALUE IF NOT EXISTS 'VALIDATED';
ALTER TYPE "FindingStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_RISK';

-- FindingSource enum
DO $$ BEGIN
  CREATE TYPE "FindingSource" AS ENUM ('PASSIVE_CHECK', 'OWASP_ZAP', 'MANUAL', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RemediationStatus: add BLOCKED (DEFERRED -> BLOCKED data migration is in the next migration)
ALTER TYPE "RemediationStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

-- RemediationPriority enum
DO $$ BEGIN
  CREATE TYPE "RemediationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Expand Finding table
ALTER TABLE "Finding"
  ADD COLUMN IF NOT EXISTS "clientId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "FindingSource" NOT NULL DEFAULT 'PASSIVE_CHECK',
  ADD COLUMN IF NOT EXISTS "cvssScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "evidence" JSONB,
  ADD COLUMN IF NOT EXISTS "remediationGuidance" TEXT,
  ADD COLUMN IF NOT EXISTS "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedRiskApprovedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedRiskApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acceptedRiskReviewDate" TIMESTAMP(3);

-- Backfill detection timestamps from createdAt
UPDATE "Finding"
SET "firstDetectedAt" = "createdAt",
    "lastDetectedAt" = COALESCE("resolvedAt", "updatedAt", "createdAt")
WHERE TRUE;

-- Backfill clientId from Asset
UPDATE "Finding" f
SET "clientId" = a."clientId"
FROM "Asset" a
WHERE f."assetId" = a."id" AND f."clientId" IS NULL;

-- Expand RemediationTask
ALTER TABLE "RemediationTask"
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" "RemediationPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;

-- Foreign keys (idempotent)
DO $$ BEGIN
  ALTER TABLE "Finding"
    ADD CONSTRAINT "Finding_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Finding"
    ADD CONSTRAINT "Finding_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Finding"
    ADD CONSTRAINT "Finding_acceptedRiskApprovedByUserId_fkey"
    FOREIGN KEY ("acceptedRiskApprovedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RemediationTask"
    ADD CONSTRAINT "RemediationTask_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "Finding_clientId_idx" ON "Finding"("clientId");
CREATE INDEX IF NOT EXISTS "Finding_source_idx" ON "Finding"("source");
CREATE INDEX IF NOT EXISTS "Finding_assignedToUserId_idx" ON "Finding"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "Finding_dueDate_idx" ON "Finding"("dueDate");
CREATE INDEX IF NOT EXISTS "Finding_organizationId_assetId_code_idx" ON "Finding"("organizationId", "assetId", "code");
CREATE INDEX IF NOT EXISTS "RemediationTask_findingId_idx" ON "RemediationTask"("findingId");
CREATE INDEX IF NOT EXISTS "RemediationTask_assignedToUserId_idx" ON "RemediationTask"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "RemediationTask_dueDate_idx" ON "RemediationTask"("dueDate");
