-- Additive only: in-app notifications + SLA escalation ledger (Phases 4a–4c).
-- No DROP / TRUNCATE / destructive ALTER / historical data deletion.

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('INCIDENT', 'FINDING', 'INVESTIGATION', 'SECURITY_EVENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'INCIDENT_CREATED_CRITICAL',
  'INCIDENT_ASSIGNED',
  'FINDING_ASSIGNED',
  'INVESTIGATION_CONFIRMED',
  'SLA_MTTA_HALF',
  'SLA_MTTA_APPROACHING',
  'SLA_MTTA_BREACHED',
  'SLA_MTTC_APPROACHING',
  'SLA_MTTC_BREACHED',
  'SLA_MTTR_APPROACHING',
  'SLA_MTTR_BREACHED'
);

-- CreateEnum
CREATE TYPE "EscalationTriggerType" AS ENUM (
  'MTTA_HALF',
  'MTTA_APPROACHING',
  'MTTA_BREACHED',
  'MTTC_APPROACHING',
  'MTTC_BREACHED',
  'MTTR_APPROACHING',
  'MTTR_BREACHED'
);

-- CreateEnum
CREATE TYPE "EscalationMetric" AS ENUM ('MTTA', 'MTTC', 'MTTR');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sourceType" "NotificationSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "clientId" TEXT,
    "assetId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "slaSnapshotId" TEXT,
    "metric" "EscalationMetric" NOT NULL,
    "triggerType" "EscalationTriggerType" NOT NULL,
    "thresholdPct" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaEscalationWorkerState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastRunStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaEscalationWorkerState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_type_idx" ON "Notification"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Notification_organizationId_severity_idx" ON "Notification"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "Notification_organizationId_clientId_idx" ON "Notification"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_sourceType_sourceId_idx" ON "Notification"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_dedupeKey_key" ON "Notification"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationRecipient_organizationId_userId_createdAt_idx" ON "NotificationRecipient"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_organizationId_userId_readAt_idx" ON "NotificationRecipient"("organizationId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_organizationId_userId_dismissedAt_idx" ON "NotificationRecipient"("organizationId", "userId", "dismissedAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_dismissedAt_idx" ON "NotificationRecipient"("userId", "dismissedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "EscalationEvent_organizationId_incidentId_idx" ON "EscalationEvent"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "EscalationEvent_organizationId_firedAt_idx" ON "EscalationEvent"("organizationId", "firedAt");

-- CreateIndex
CREATE INDEX "EscalationEvent_slaSnapshotId_idx" ON "EscalationEvent"("slaSnapshotId");

-- CreateIndex
CREATE INDEX "EscalationEvent_organizationId_triggerType_idx" ON "EscalationEvent"("organizationId", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationEvent_organizationId_dedupeKey_key" ON "EscalationEvent"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_slaSnapshotId_fkey" FOREIGN KEY ("slaSnapshotId") REFERENCES "IncidentSlaSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
