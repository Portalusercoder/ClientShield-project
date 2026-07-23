-- CreateEnum
CREATE TYPE "SlaSnapshotSource" AS ENUM ('ORG_DEFAULT', 'CLIENT_OVERRIDE');

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "severity" "IncidentSeverity" NOT NULL,
    "mttaMinutes" INTEGER,
    "mttcMinutes" INTEGER,
    "mttrMinutes" INTEGER,
    "approachingThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentSlaSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "policyId" TEXT,
    "clientIdAtSnapshot" TEXT,
    "severityAtSnapshot" "IncidentSeverity" NOT NULL,
    "mttaMinutes" INTEGER,
    "mttcMinutes" INTEGER,
    "mttrMinutes" INTEGER,
    "approachingThresholdPct" INTEGER NOT NULL,
    "snapshotSource" "SlaSnapshotSource" NOT NULL,
    "snappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentSlaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaPolicy_organizationId_enabled_idx" ON "SlaPolicy"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "SlaPolicy_organizationId_clientId_idx" ON "SlaPolicy"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "SlaPolicy_organizationId_severity_idx" ON "SlaPolicy"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "SlaPolicy_clientId_idx" ON "SlaPolicy"("clientId");

-- Partial unique: one org default per organization + severity
CREATE UNIQUE INDEX "SlaPolicy_org_default_severity_key"
  ON "SlaPolicy" ("organizationId", "severity")
  WHERE "clientId" IS NULL;

-- Partial unique: one client override per organization + client + severity
CREATE UNIQUE INDEX "SlaPolicy_org_client_severity_key"
  ON "SlaPolicy" ("organizationId", "clientId", "severity")
  WHERE "clientId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "IncidentSlaSnapshot_organizationId_idx" ON "IncidentSlaSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "IncidentSlaSnapshot_incidentId_idx" ON "IncidentSlaSnapshot"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentSlaSnapshot_organizationId_incidentId_idx" ON "IncidentSlaSnapshot"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "IncidentSlaSnapshot_policyId_idx" ON "IncidentSlaSnapshot"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentSlaSnapshot_incidentId_generation_key" ON "IncidentSlaSnapshot"("incidentId", "generation");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentSlaSnapshot" ADD CONSTRAINT "IncidentSlaSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentSlaSnapshot" ADD CONSTRAINT "IncidentSlaSnapshot_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentSlaSnapshot" ADD CONSTRAINT "IncidentSlaSnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentSlaSnapshot" ADD CONSTRAINT "IncidentSlaSnapshot_clientIdAtSnapshot_fkey" FOREIGN KEY ("clientIdAtSnapshot") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
