-- Incident Management expansion
-- Preserves existing Incident rows. Expands enums and adds workflow tables.

-- Expand IncidentSeverity (INFO is new; existing values preserved)
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'INFO';

-- Expand IncidentStatus lifecycle
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'ERADICATED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'RECOVERING';

-- New enums
CREATE TYPE "IncidentCategory" AS ENUM (
  'MALWARE',
  'PHISHING',
  'ACCOUNT_COMPROMISE',
  'UNAUTHORIZED_ACCESS',
  'BRUTE_FORCE',
  'DATA_EXPOSURE',
  'DATA_EXFILTRATION',
  'WEB_ATTACK',
  'DENIAL_OF_SERVICE',
  'VULNERABILITY_EXPLOITATION',
  'SUSPICIOUS_ACTIVITY',
  'POLICY_VIOLATION',
  'IOT_SECURITY',
  'OTHER'
);

CREATE TYPE "IncidentSource" AS ENUM (
  'MANUAL',
  'FINDING',
  'WAZUH',
  'OWASP_ZAP',
  'PASSIVE_CHECK',
  'OTHER'
);

CREATE TYPE "IncidentDetectionMethod" AS ENUM (
  'MANUAL',
  'SIEM',
  'EDR',
  'IDS_IPS',
  'VULNERABILITY_SCANNER',
  'WEB_MONITORING',
  'USER_REPORT',
  'OTHER'
);

CREATE TYPE "IncidentActivityType" AS ENUM (
  'CREATED',
  'ACKNOWLEDGED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'SEVERITY_CHANGED',
  'NOTE_ADDED',
  'FINDING_LINKED',
  'FINDING_UNLINKED',
  'REMEDIATION_LINKED',
  'CONTAINMENT_UPDATED',
  'ERADICATION_UPDATED',
  'RECOVERY_UPDATED',
  'INVESTIGATION_UPDATED',
  'RESOLUTION_UPDATED',
  'LESSONS_UPDATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED'
);

-- Existing incidents without a client cannot satisfy the new required clientId.
-- There should be none in seed/dev; delete orphans if any remain.
DELETE FROM "Incident" WHERE "clientId" IS NULL;

-- Expand Incident columns
ALTER TABLE "Incident"
  ADD COLUMN IF NOT EXISTS "assetId" TEXT,
  ADD COLUMN IF NOT EXISTS "category" "IncidentCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "source" "IncidentSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "externalSourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "detectionMethod" "IncidentDetectionMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "investigationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "containedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eradicatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recoveringAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "businessImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "technicalImpact" TEXT,
  ADD COLUMN IF NOT EXISTS "rootCause" TEXT,
  ADD COLUMN IF NOT EXISTS "containmentSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "eradicationSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "recoverySummary" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "lessonsLearned" TEXT;

-- Backfill reportedAt from detectedAt for existing rows
UPDATE "Incident"
SET "reportedAt" = "detectedAt"
WHERE "reportedAt" IS NULL OR "reportedAt" = "createdAt";

-- Require clientId
ALTER TABLE "Incident" ALTER COLUMN "clientId" SET NOT NULL;

-- Recreate client FK with CASCADE (was SET NULL)
ALTER TABLE "Incident" DROP CONSTRAINT IF EXISTS "Incident_clientId_fkey";
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Incident_assetId_idx" ON "Incident"("assetId");
CREATE INDEX IF NOT EXISTS "Incident_category_idx" ON "Incident"("category");
CREATE INDEX IF NOT EXISTS "Incident_source_idx" ON "Incident"("source");
CREATE INDEX IF NOT EXISTS "Incident_assignedToUserId_idx" ON "Incident"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "Incident_detectedAt_idx" ON "Incident"("detectedAt");
CREATE INDEX IF NOT EXISTS "Incident_organizationId_status_idx" ON "Incident"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Incident_organizationId_externalSourceId_idx" ON "Incident"("organizationId", "externalSourceId");

-- IncidentActivity (append-only timeline)
CREATE TABLE "IncidentActivity" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "activityType" "IncidentActivityType" NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncidentActivity_organizationId_idx" ON "IncidentActivity"("organizationId");
CREATE INDEX "IncidentActivity_incidentId_idx" ON "IncidentActivity"("incidentId");
CREATE INDEX "IncidentActivity_createdAt_idx" ON "IncidentActivity"("createdAt");
CREATE INDEX "IncidentActivity_incidentId_createdAt_idx" ON "IncidentActivity"("incidentId", "createdAt");

ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IncidentNote (immutable after create)
CREATE TABLE "IncidentNote" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncidentNote_organizationId_idx" ON "IncidentNote"("organizationId");
CREATE INDEX "IncidentNote_incidentId_idx" ON "IncidentNote"("incidentId");
CREATE INDEX "IncidentNote_createdAt_idx" ON "IncidentNote"("createdAt");

ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IncidentFinding (many-to-many)
CREATE TABLE "IncidentFinding" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncidentFinding_incidentId_findingId_key" ON "IncidentFinding"("incidentId", "findingId");
CREATE INDEX "IncidentFinding_organizationId_idx" ON "IncidentFinding"("organizationId");
CREATE INDEX "IncidentFinding_incidentId_idx" ON "IncidentFinding"("incidentId");
CREATE INDEX "IncidentFinding_findingId_idx" ON "IncidentFinding"("findingId");

ALTER TABLE "IncidentFinding" ADD CONSTRAINT "IncidentFinding_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentFinding" ADD CONSTRAINT "IncidentFinding_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentFinding" ADD CONSTRAINT "IncidentFinding_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentFinding" ADD CONSTRAINT "IncidentFinding_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
