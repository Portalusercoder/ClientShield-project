-- AlterEnum
CREATE TYPE "SecurityEventActivityType" AS ENUM (
  'CREATED',
  'CORRELATED_OCCURRENCE',
  'REVIEW_STARTED',
  'ACKNOWLEDGED',
  'DISMISSED',
  'ESCALATED',
  'LINKED_TO_INCIDENT',
  'UNLINKED_FROM_INCIDENT',
  'CLASSIFICATION_CHANGED'
);

-- AlterTable
ALTER TABLE "SecurityEvent"
  ADD COLUMN IF NOT EXISTS "correlationSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "processName" TEXT,
  ADD COLUMN IF NOT EXISTS "filePath" TEXT,
  ADD COLUMN IF NOT EXISTS "commandLine" TEXT;

-- CreateTable
CREATE TABLE "SecurityEventActivity" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "activityType" "SecurityEventActivityType" NOT NULL,
  "message" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEventActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEventActivity_organizationId_idx" ON "SecurityEventActivity"("organizationId");
CREATE INDEX "SecurityEventActivity_securityEventId_idx" ON "SecurityEventActivity"("securityEventId");
CREATE INDEX "SecurityEventActivity_createdAt_idx" ON "SecurityEventActivity"("createdAt");
CREATE INDEX "SecurityEventActivity_securityEventId_createdAt_idx" ON "SecurityEventActivity"("securityEventId", "createdAt");
CREATE INDEX "SecurityEventActivity_securityEventId_activityType_idx" ON "SecurityEventActivity"("securityEventId", "activityType");

-- AddForeignKey
ALTER TABLE "SecurityEventActivity"
  ADD CONSTRAINT "SecurityEventActivity_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEventActivity"
  ADD CONSTRAINT "SecurityEventActivity_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEventActivity"
  ADD CONSTRAINT "SecurityEventActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
