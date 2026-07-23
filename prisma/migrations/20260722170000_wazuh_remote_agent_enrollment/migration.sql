-- Remote Wazuh agent enrollment (application layer). Does not change Docker port bindings.

CREATE TYPE "WazuhEnrollmentStatus" AS ENUM (
  'PENDING',
  'READY',
  'ENROLLING',
  'ENROLLED',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'REVOKED'
);

CREATE TYPE "WazuhEnrollmentPlatform" AS ENUM ('MACOS', 'WINDOWS', 'LINUX');
CREATE TYPE "WazuhEnrollmentArch" AS ENUM ('ARM64', 'X64');
CREATE TYPE "WazuhAgentMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "WazuhAgentMapping" ADD COLUMN IF NOT EXISTS "status" "WazuhAgentMappingStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "WazuhAgentMapping" ADD COLUMN IF NOT EXISTS "inactiveAt" TIMESTAMP(3);
ALTER TABLE "WazuhAgentMapping" ADD COLUMN IF NOT EXISTS "inactiveReason" TEXT;

CREATE INDEX IF NOT EXISTS "WazuhAgentMapping_status_idx" ON "WazuhAgentMapping"("status");

CREATE TABLE "WazuhAgentEnrollment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "expectedHostname" TEXT NOT NULL,
    "platform" "WazuhEnrollmentPlatform" NOT NULL,
    "architecture" "WazuhEnrollmentArch" NOT NULL,
    "status" "WazuhEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "connectionHint" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "enrolledAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "wazuhAgentId" TEXT,
    "mappingId" TEXT,
    "createdByUserId" TEXT,
    "lastErrorSanitized" TEXT,
    "hostnameMismatch" BOOLEAN NOT NULL DEFAULT false,
    "observedHostname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WazuhAgentEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WazuhAgentEnrollment_organizationId_idx" ON "WazuhAgentEnrollment"("organizationId");
CREATE INDEX "WazuhAgentEnrollment_clientId_idx" ON "WazuhAgentEnrollment"("clientId");
CREATE INDEX "WazuhAgentEnrollment_assetId_idx" ON "WazuhAgentEnrollment"("assetId");
CREATE INDEX "WazuhAgentEnrollment_status_idx" ON "WazuhAgentEnrollment"("status");
CREATE INDEX "WazuhAgentEnrollment_expiresAt_idx" ON "WazuhAgentEnrollment"("expiresAt");
CREATE INDEX "WazuhAgentEnrollment_wazuhAgentId_idx" ON "WazuhAgentEnrollment"("wazuhAgentId");

ALTER TABLE "WazuhAgentEnrollment" ADD CONSTRAINT "WazuhAgentEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentEnrollment" ADD CONSTRAINT "WazuhAgentEnrollment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentEnrollment" ADD CONSTRAINT "WazuhAgentEnrollment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentEnrollment" ADD CONSTRAINT "WazuhAgentEnrollment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WazuhAgentEnrollment" ADD CONSTRAINT "WazuhAgentEnrollment_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "WazuhAgentMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
