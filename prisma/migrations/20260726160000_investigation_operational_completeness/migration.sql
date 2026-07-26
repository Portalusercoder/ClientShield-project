-- Phase 6b2: Investigation operational completeness
-- Lifecycle states, assignment timestamps, notes, close/reopen audit fields.

-- Forward-compatible status values (existing rows unchanged).
ALTER TYPE "InvestigationStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "InvestigationStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "InvestigationStatus" ADD VALUE IF NOT EXISTS 'RESOLVED';

-- Timeline / activity types for assignment, notes, close/reopen.
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'NOTE_EDITED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'NOTE_DELETED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'REASSIGNED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'UNASSIGNED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'STATUS_CHANGED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'RESOLVED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'REOPENED';

ALTER TABLE "InvestigationGroup"
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolutionSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastReopenReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationGroup_closedByUserId_fkey'
  ) THEN
    ALTER TABLE "InvestigationGroup"
      ADD CONSTRAINT "InvestigationGroup_closedByUserId_fkey"
      FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationGroup_reopenedByUserId_fkey'
  ) THEN
    ALTER TABLE "InvestigationGroup"
      ADD CONSTRAINT "InvestigationGroup_reopenedByUserId_fkey"
      FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InvestigationGroup_closedAt_idx"
  ON "InvestigationGroup"("closedAt");

CREATE TABLE IF NOT EXISTS "InvestigationNote" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,

  CONSTRAINT "InvestigationNote_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationNote_organizationId_fkey'
  ) THEN
    ALTER TABLE "InvestigationNote"
      ADD CONSTRAINT "InvestigationNote_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationNote_groupId_fkey'
  ) THEN
    ALTER TABLE "InvestigationNote"
      ADD CONSTRAINT "InvestigationNote_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "InvestigationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationNote_authorUserId_fkey'
  ) THEN
    ALTER TABLE "InvestigationNote"
      ADD CONSTRAINT "InvestigationNote_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationNote_deletedByUserId_fkey'
  ) THEN
    ALTER TABLE "InvestigationNote"
      ADD CONSTRAINT "InvestigationNote_deletedByUserId_fkey"
      FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InvestigationNote_organizationId_idx"
  ON "InvestigationNote"("organizationId");
CREATE INDEX IF NOT EXISTS "InvestigationNote_groupId_idx"
  ON "InvestigationNote"("groupId");
CREATE INDEX IF NOT EXISTS "InvestigationNote_createdAt_idx"
  ON "InvestigationNote"("createdAt");
CREATE INDEX IF NOT EXISTS "InvestigationNote_groupId_deletedAt_idx"
  ON "InvestigationNote"("groupId", "deletedAt");
