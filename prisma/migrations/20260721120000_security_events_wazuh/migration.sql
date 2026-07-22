-- Security Events + Wazuh read-only integration schema

ALTER TYPE "IncidentActivityType" ADD VALUE IF NOT EXISTS 'SECURITY_EVENT_LINKED';
ALTER TYPE "IncidentActivityType" ADD VALUE IF NOT EXISTS 'SECURITY_EVENT_UNLINKED';

CREATE TYPE "SecurityEventSource" AS ENUM ('WAZUH');

CREATE TYPE "SecurityEventSeverity" AS ENUM (
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO'
);

CREATE TYPE "SecurityEventStatus" AS ENUM (
  'NEW',
  'REVIEWING',
  'ACKNOWLEDGED',
  'ESCALATED',
  'DISMISSED'
);

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT,
  "assetId" TEXT,
  "source" "SecurityEventSource" NOT NULL DEFAULT 'WAZUH',
  "externalEventId" TEXT,
  "ruleId" TEXT,
  "ruleLevel" INTEGER,
  "ruleDescription" TEXT,
  "ruleGroups" JSONB,
  "agentId" TEXT,
  "agentName" TEXT,
  "severity" "SecurityEventSeverity" NOT NULL,
  "status" "SecurityEventStatus" NOT NULL DEFAULT 'NEW',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "correlationKey" TEXT NOT NULL,
  "sourceIp" TEXT,
  "destinationIp" TEXT,
  "sourcePort" INTEGER,
  "destinationPort" INTEGER,
  "protocol" TEXT,
  "mitreTactics" JSONB,
  "mitreTechniques" JSONB,
  "pciDss" JSONB,
  "gdpr" JSONB,
  "hipaa" JSONB,
  "nist" JSONB,
  "rawDataSanitized" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "dismissedByUserId" TEXT,
  "dismissalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_organizationId_idx" ON "SecurityEvent"("organizationId");
CREATE INDEX "SecurityEvent_clientId_idx" ON "SecurityEvent"("clientId");
CREATE INDEX "SecurityEvent_assetId_idx" ON "SecurityEvent"("assetId");
CREATE INDEX "SecurityEvent_status_idx" ON "SecurityEvent"("status");
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");
CREATE INDEX "SecurityEvent_source_idx" ON "SecurityEvent"("source");
CREATE INDEX "SecurityEvent_ruleId_idx" ON "SecurityEvent"("ruleId");
CREATE INDEX "SecurityEvent_agentId_idx" ON "SecurityEvent"("agentId");
CREATE INDEX "SecurityEvent_lastSeenAt_idx" ON "SecurityEvent"("lastSeenAt");
CREATE INDEX "SecurityEvent_organizationId_correlationKey_idx" ON "SecurityEvent"("organizationId", "correlationKey");
CREATE INDEX "SecurityEvent_organizationId_status_idx" ON "SecurityEvent"("organizationId", "status");
CREATE INDEX "SecurityEvent_organizationId_lastSeenAt_idx" ON "SecurityEvent"("organizationId", "lastSeenAt");

ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_dismissedByUserId_fkey"
  FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IncidentSecurityEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncidentSecurityEvent_incidentId_securityEventId_key"
  ON "IncidentSecurityEvent"("incidentId", "securityEventId");
CREATE INDEX "IncidentSecurityEvent_organizationId_idx" ON "IncidentSecurityEvent"("organizationId");
CREATE INDEX "IncidentSecurityEvent_incidentId_idx" ON "IncidentSecurityEvent"("incidentId");
CREATE INDEX "IncidentSecurityEvent_securityEventId_idx" ON "IncidentSecurityEvent"("securityEventId");

ALTER TABLE "IncidentSecurityEvent" ADD CONSTRAINT "IncidentSecurityEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentSecurityEvent" ADD CONSTRAINT "IncidentSecurityEvent_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentSecurityEvent" ADD CONSTRAINT "IncidentSecurityEvent_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentSecurityEvent" ADD CONSTRAINT "IncidentSecurityEvent_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WazuhAgentMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "wazuhAgentId" TEXT NOT NULL,
  "wazuhAgentName" TEXT,
  "clientId" TEXT,
  "assetId" TEXT,
  "lastKnownStatus" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "mappedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WazuhAgentMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WazuhAgentMapping_organizationId_wazuhAgentId_key"
  ON "WazuhAgentMapping"("organizationId", "wazuhAgentId");
CREATE INDEX "WazuhAgentMapping_organizationId_idx" ON "WazuhAgentMapping"("organizationId");
CREATE INDEX "WazuhAgentMapping_clientId_idx" ON "WazuhAgentMapping"("clientId");
CREATE INDEX "WazuhAgentMapping_assetId_idx" ON "WazuhAgentMapping"("assetId");

ALTER TABLE "WazuhAgentMapping" ADD CONSTRAINT "WazuhAgentMapping_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentMapping" ADD CONSTRAINT "WazuhAgentMapping_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentMapping" ADD CONSTRAINT "WazuhAgentMapping_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentMapping" ADD CONSTRAINT "WazuhAgentMapping_mappedByUserId_fkey"
  FOREIGN KEY ("mappedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WazuhIngestionState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "lastTimestamp" TIMESTAMP(3),
  "lastDocumentId" TEXT,
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WazuhIngestionState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WazuhIngestionState_organizationId_key" ON "WazuhIngestionState"("organizationId");

ALTER TABLE "WazuhIngestionState" ADD CONSTRAINT "WazuhIngestionState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WazuhProcessedAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "securityEventId" TEXT,
  "alertTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WazuhProcessedAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WazuhProcessedAlert_organizationId_documentId_key"
  ON "WazuhProcessedAlert"("organizationId", "documentId");
CREATE INDEX "WazuhProcessedAlert_organizationId_idx" ON "WazuhProcessedAlert"("organizationId");
CREATE INDEX "WazuhProcessedAlert_securityEventId_idx" ON "WazuhProcessedAlert"("securityEventId");

ALTER TABLE "WazuhProcessedAlert" ADD CONSTRAINT "WazuhProcessedAlert_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WazuhProcessedAlert" ADD CONSTRAINT "WazuhProcessedAlert_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
