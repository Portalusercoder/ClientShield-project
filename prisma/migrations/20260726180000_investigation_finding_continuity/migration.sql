-- Phase 6b4: Investigation ↔ Finding continuity (primary Investigation on Finding).

ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'FINDING_CREATED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'FINDING_LINKED';
ALTER TYPE "InvestigationActivityType" ADD VALUE IF NOT EXISTS 'FINDING_UNLINKED';

ALTER TABLE "Finding"
  ADD COLUMN IF NOT EXISTS "investigationGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "investigationLinkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "investigationLinkedByUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Finding_investigationGroupId_fkey'
  ) THEN
    ALTER TABLE "Finding"
      ADD CONSTRAINT "Finding_investigationGroupId_fkey"
      FOREIGN KEY ("investigationGroupId") REFERENCES "InvestigationGroup"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Finding_investigationLinkedByUserId_fkey'
  ) THEN
    ALTER TABLE "Finding"
      ADD CONSTRAINT "Finding_investigationLinkedByUserId_fkey"
      FOREIGN KEY ("investigationLinkedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Finding_investigationGroupId_idx"
  ON "Finding"("investigationGroupId");
CREATE INDEX IF NOT EXISTS "Finding_organizationId_investigationGroupId_idx"
  ON "Finding"("organizationId", "investigationGroupId");
