-- Phase 6b1: SE ↔ Investigation handoff activity types + optional investigation assignee.

ALTER TYPE "SecurityEventActivityType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_CREATED';
ALTER TYPE "SecurityEventActivityType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_LINKED';
ALTER TYPE "SecurityEventActivityType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_SUGGESTION_ACCEPTED';
ALTER TYPE "SecurityEventActivityType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_SUGGESTION_DISMISSED';

ALTER TABLE "InvestigationGroup"
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InvestigationGroup_assignedToUserId_fkey'
  ) THEN
    ALTER TABLE "InvestigationGroup"
      ADD CONSTRAINT "InvestigationGroup_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InvestigationGroup_assignedToUserId_idx"
  ON "InvestigationGroup"("assignedToUserId");
