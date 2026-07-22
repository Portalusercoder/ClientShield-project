-- CreateEnum
CREATE TYPE "ObservableType" AS ENUM (
  'IP_ADDRESS',
  'DOMAIN',
  'HOSTNAME',
  'URL',
  'FILE_HASH',
  'FILE_PATH',
  'PROCESS',
  'USERNAME',
  'EMAIL',
  'OTHER'
);

CREATE TYPE "ObservableRole" AS ENUM (
  'SOURCE',
  'DESTINATION',
  'SUBJECT',
  'PROCESS',
  'FILE',
  'NETWORK',
  'OTHER'
);

CREATE TYPE "CorrelationCandidateStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE "CorrelationConfidence" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE "InvestigationStatus" AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'CONFIRMED',
  'DISMISSED',
  'LINKED_TO_INCIDENT',
  'CLOSED'
);

CREATE TYPE "InvestigationCreatedByType" AS ENUM (
  'SYSTEM_SUGGESTED',
  'ANALYST_CREATED'
);

CREATE TYPE "InvestigationActivityType" AS ENUM (
  'CREATED',
  'CANDIDATE_ACCEPTED',
  'CANDIDATE_REJECTED',
  'EVENT_ADDED',
  'EVENT_REMOVED',
  'INVESTIGATION_STARTED',
  'CONFIRMED',
  'DISMISSED',
  'THREAT_INTEL_LOOKUP',
  'LINKED_TO_INCIDENT',
  'INCIDENT_CREATED',
  'NOTE_ADDED'
);

CREATE TYPE "ThreatIntelLookupStatus" AS ENUM (
  'PENDING',
  'SUCCESS',
  'NOT_FOUND',
  'ERROR'
);

CREATE TYPE "ThreatIntelRiskLevel" AS ENUM (
  'UNKNOWN',
  'LOW',
  'MEDIUM',
  'HIGH',
  'MALICIOUS'
);

-- CreateTable
CREATE TABLE "SecurityObservable" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "ObservableType" NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityObservable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEventObservable" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "observableId" TEXT NOT NULL,
  "role" "ObservableRole" NOT NULL DEFAULT 'OTHER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEventObservable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT,
  "assetId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
  "createdByType" "InvestigationCreatedByType" NOT NULL,
  "createdByUserId" TEXT,
  "groupingExplanation" TEXT,
  "mitreTactics" JSONB,
  "mitreTechniques" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "dismissReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvestigationGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorrelationCandidate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventAId" TEXT NOT NULL,
  "eventBId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" "CorrelationConfidence" NOT NULL,
  "reasons" JSONB NOT NULL,
  "status" "CorrelationCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "investigationGroupId" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorrelationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationGroupEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "addedByUserId" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "removeReason" TEXT,
  CONSTRAINT "InvestigationGroupEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationGroupIncident" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestigationGroupIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationActivity" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "activityType" "InvestigationActivityType" NOT NULL,
  "message" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestigationActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ThreatIntelLookup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "observableId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "ThreatIntelLookupStatus" NOT NULL DEFAULT 'PENDING',
  "riskLevel" "ThreatIntelRiskLevel",
  "confidence" DOUBLE PRECISION,
  "summary" TEXT,
  "rawResponseSanitized" JSONB,
  "lookedUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "requestedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThreatIntelLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityObservable_organizationId_type_normalizedValue_key"
  ON "SecurityObservable"("organizationId", "type", "normalizedValue");
CREATE INDEX "SecurityObservable_organizationId_idx" ON "SecurityObservable"("organizationId");
CREATE INDEX "SecurityObservable_type_idx" ON "SecurityObservable"("type");
CREATE INDEX "SecurityObservable_organizationId_type_idx" ON "SecurityObservable"("organizationId", "type");
CREATE INDEX "SecurityObservable_lastSeenAt_idx" ON "SecurityObservable"("lastSeenAt");

CREATE UNIQUE INDEX "SecurityEventObservable_securityEventId_observableId_role_key"
  ON "SecurityEventObservable"("securityEventId", "observableId", "role");
CREATE INDEX "SecurityEventObservable_organizationId_idx" ON "SecurityEventObservable"("organizationId");
CREATE INDEX "SecurityEventObservable_securityEventId_idx" ON "SecurityEventObservable"("securityEventId");
CREATE INDEX "SecurityEventObservable_observableId_idx" ON "SecurityEventObservable"("observableId");

CREATE INDEX "InvestigationGroup_organizationId_idx" ON "InvestigationGroup"("organizationId");
CREATE INDEX "InvestigationGroup_status_idx" ON "InvestigationGroup"("status");
CREATE INDEX "InvestigationGroup_severity_idx" ON "InvestigationGroup"("severity");
CREATE INDEX "InvestigationGroup_createdByType_idx" ON "InvestigationGroup"("createdByType");
CREATE INDEX "InvestigationGroup_organizationId_status_idx" ON "InvestigationGroup"("organizationId", "status");
CREATE INDEX "InvestigationGroup_createdAt_idx" ON "InvestigationGroup"("createdAt");

CREATE UNIQUE INDEX "CorrelationCandidate_organizationId_eventAId_eventBId_key"
  ON "CorrelationCandidate"("organizationId", "eventAId", "eventBId");
CREATE INDEX "CorrelationCandidate_organizationId_idx" ON "CorrelationCandidate"("organizationId");
CREATE INDEX "CorrelationCandidate_eventAId_idx" ON "CorrelationCandidate"("eventAId");
CREATE INDEX "CorrelationCandidate_eventBId_idx" ON "CorrelationCandidate"("eventBId");
CREATE INDEX "CorrelationCandidate_status_idx" ON "CorrelationCandidate"("status");
CREATE INDEX "CorrelationCandidate_confidence_idx" ON "CorrelationCandidate"("confidence");
CREATE INDEX "CorrelationCandidate_organizationId_status_idx" ON "CorrelationCandidate"("organizationId", "status");
CREATE INDEX "CorrelationCandidate_investigationGroupId_idx" ON "CorrelationCandidate"("investigationGroupId");

CREATE UNIQUE INDEX "InvestigationGroupEvent_groupId_securityEventId_key"
  ON "InvestigationGroupEvent"("groupId", "securityEventId");
CREATE INDEX "InvestigationGroupEvent_organizationId_idx" ON "InvestigationGroupEvent"("organizationId");
CREATE INDEX "InvestigationGroupEvent_groupId_idx" ON "InvestigationGroupEvent"("groupId");
CREATE INDEX "InvestigationGroupEvent_securityEventId_idx" ON "InvestigationGroupEvent"("securityEventId");

CREATE UNIQUE INDEX "InvestigationGroupIncident_groupId_incidentId_key"
  ON "InvestigationGroupIncident"("groupId", "incidentId");
CREATE INDEX "InvestigationGroupIncident_organizationId_idx" ON "InvestigationGroupIncident"("organizationId");
CREATE INDEX "InvestigationGroupIncident_groupId_idx" ON "InvestigationGroupIncident"("groupId");
CREATE INDEX "InvestigationGroupIncident_incidentId_idx" ON "InvestigationGroupIncident"("incidentId");

CREATE INDEX "InvestigationActivity_organizationId_idx" ON "InvestigationActivity"("organizationId");
CREATE INDEX "InvestigationActivity_groupId_idx" ON "InvestigationActivity"("groupId");
CREATE INDEX "InvestigationActivity_createdAt_idx" ON "InvestigationActivity"("createdAt");
CREATE INDEX "InvestigationActivity_groupId_createdAt_idx" ON "InvestigationActivity"("groupId", "createdAt");

CREATE INDEX "ThreatIntelLookup_organizationId_idx" ON "ThreatIntelLookup"("organizationId");
CREATE INDEX "ThreatIntelLookup_observableId_idx" ON "ThreatIntelLookup"("observableId");
CREATE INDEX "ThreatIntelLookup_provider_idx" ON "ThreatIntelLookup"("provider");
CREATE INDEX "ThreatIntelLookup_status_idx" ON "ThreatIntelLookup"("status");
CREATE INDEX "ThreatIntelLookup_organizationId_observableId_provider_idx"
  ON "ThreatIntelLookup"("organizationId", "observableId", "provider");
CREATE INDEX "ThreatIntelLookup_expiresAt_idx" ON "ThreatIntelLookup"("expiresAt");

-- AddForeignKey
ALTER TABLE "SecurityObservable"
  ADD CONSTRAINT "SecurityObservable_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEventObservable"
  ADD CONSTRAINT "SecurityEventObservable_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEventObservable"
  ADD CONSTRAINT "SecurityEventObservable_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEventObservable"
  ADD CONSTRAINT "SecurityEventObservable_observableId_fkey"
  FOREIGN KEY ("observableId") REFERENCES "SecurityObservable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroup"
  ADD CONSTRAINT "InvestigationGroup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroup"
  ADD CONSTRAINT "InvestigationGroup_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrelationCandidate"
  ADD CONSTRAINT "CorrelationCandidate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrelationCandidate"
  ADD CONSTRAINT "CorrelationCandidate_eventAId_fkey"
  FOREIGN KEY ("eventAId") REFERENCES "SecurityEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrelationCandidate"
  ADD CONSTRAINT "CorrelationCandidate_eventBId_fkey"
  FOREIGN KEY ("eventBId") REFERENCES "SecurityEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrelationCandidate"
  ADD CONSTRAINT "CorrelationCandidate_investigationGroupId_fkey"
  FOREIGN KEY ("investigationGroupId") REFERENCES "InvestigationGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CorrelationCandidate"
  ADD CONSTRAINT "CorrelationCandidate_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupEvent"
  ADD CONSTRAINT "InvestigationGroupEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupEvent"
  ADD CONSTRAINT "InvestigationGroupEvent_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "InvestigationGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupEvent"
  ADD CONSTRAINT "InvestigationGroupEvent_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupEvent"
  ADD CONSTRAINT "InvestigationGroupEvent_addedByUserId_fkey"
  FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupIncident"
  ADD CONSTRAINT "InvestigationGroupIncident_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupIncident"
  ADD CONSTRAINT "InvestigationGroupIncident_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "InvestigationGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationGroupIncident"
  ADD CONSTRAINT "InvestigationGroupIncident_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationActivity"
  ADD CONSTRAINT "InvestigationActivity_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationActivity"
  ADD CONSTRAINT "InvestigationActivity_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "InvestigationGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestigationActivity"
  ADD CONSTRAINT "InvestigationActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ThreatIntelLookup"
  ADD CONSTRAINT "ThreatIntelLookup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreatIntelLookup"
  ADD CONSTRAINT "ThreatIntelLookup_observableId_fkey"
  FOREIGN KEY ("observableId") REFERENCES "SecurityObservable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreatIntelLookup"
  ADD CONSTRAINT "ThreatIntelLookup_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
