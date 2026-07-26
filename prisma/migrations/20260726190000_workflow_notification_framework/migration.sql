-- Phase 6b5: Workflow notification types + preference model (no delivery).

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INCIDENT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FINDING_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVESTIGATION_REOPENED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLAIM_TRANSFERRED';

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK', 'WEBHOOK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_organizationId_userId_eventType_channel_key"
  ON "NotificationPreference"("organizationId", "userId", "eventType", "channel");

CREATE INDEX IF NOT EXISTS "NotificationPreference_organizationId_userId_idx"
  ON "NotificationPreference"("organizationId", "userId");

CREATE INDEX IF NOT EXISTS "NotificationPreference_organizationId_eventType_channel_idx"
  ON "NotificationPreference"("organizationId", "eventType", "channel");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_organizationId_fkey'
  ) THEN
    ALTER TABLE "NotificationPreference"
      ADD CONSTRAINT "NotificationPreference_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationPreference"
      ADD CONSTRAINT "NotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
