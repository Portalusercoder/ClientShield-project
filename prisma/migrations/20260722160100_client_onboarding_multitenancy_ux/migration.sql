-- Client onboarding models + conservative lifecycle backfill

CREATE TYPE "ClientContactType" AS ENUM ('PRIMARY', 'TECHNICAL', 'SECURITY', 'BILLING', 'EXECUTIVE', 'OTHER');
CREATE TYPE "ClientServiceType" AS ENUM ('PASSIVE_WEB_MONITORING', 'ZAP_BASELINE', 'WAZUH_ENDPOINT_MONITORING', 'SECURITY_EVENT_MONITORING', 'INCIDENT_RESPONSE', 'REPORTING');
CREATE TYPE "ClientServiceStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'DISABLED');
CREATE TYPE "ClientOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY', 'COMPLETED');
CREATE TYPE "ClientOnboardingStep" AS ENUM ('CLIENT_PROFILE', 'CONTACTS', 'SECURITY_SCOPE', 'ASSETS', 'SERVICES', 'AUTHORIZATION', 'REVIEW');
CREATE TYPE "ClientUserAccessStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');
CREATE TYPE "ClientUserAccessRole" AS ENUM ('CLIENT_VIEWER', 'CLIENT_ADMIN');

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "onboardingStartedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "offboardedAt" TIMESTAMP(3);

CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT,
    "defaultTimezone" TEXT DEFAULT 'UTC',
    "securityContactEmail" TEXT,
    "defaultReportBranding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "contactType" "ClientContactType" NOT NULL DEFAULT 'OTHER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientContact_organizationId_idx" ON "ClientContact"("organizationId");
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");
CREATE INDEX "ClientContact_organizationId_clientId_isPrimary_idx" ON "ClientContact"("organizationId", "clientId", "isPrimary");

CREATE TABLE "ClientService" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceType" "ClientServiceType" NOT NULL,
    "status" "ClientServiceStatus" NOT NULL DEFAULT 'PLANNED',
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientService_organizationId_clientId_serviceType_key" ON "ClientService"("organizationId", "clientId", "serviceType");
CREATE INDEX "ClientService_organizationId_idx" ON "ClientService"("organizationId");
CREATE INDEX "ClientService_clientId_idx" ON "ClientService"("clientId");
CREATE INDEX "ClientService_status_idx" ON "ClientService"("status");

CREATE TABLE "ClientOnboarding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "ClientOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" "ClientOnboardingStep" NOT NULL DEFAULT 'CLIENT_PROFILE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientOnboarding_clientId_key" ON "ClientOnboarding"("clientId");
CREATE INDEX "ClientOnboarding_organizationId_idx" ON "ClientOnboarding"("organizationId");
CREATE INDEX "ClientOnboarding_status_idx" ON "ClientOnboarding"("status");

CREATE TABLE "ClientUserAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessRole" "ClientUserAccessRole" NOT NULL DEFAULT 'CLIENT_VIEWER',
    "status" "ClientUserAccessStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientUserAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientUserAccess_organizationId_clientId_userId_key" ON "ClientUserAccess"("organizationId", "clientId", "userId");
CREATE INDEX "ClientUserAccess_organizationId_idx" ON "ClientUserAccess"("organizationId");
CREATE INDEX "ClientUserAccess_clientId_idx" ON "ClientUserAccess"("clientId");
CREATE INDEX "ClientUserAccess_userId_idx" ON "ClientUserAccess"("userId");

ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientUserAccess" ADD CONSTRAINT "ClientUserAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientUserAccess" ADD CONSTRAINT "ClientUserAccess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientUserAccess" ADD CONSTRAINT "ClientUserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Conservative backfill: never mark live clients OFFBOARDED incorrectly.
UPDATE "Client"
SET "activatedAt" = COALESCE("activatedAt", "createdAt")
WHERE "status" = 'ACTIVE' AND "activatedAt" IS NULL;

UPDATE "Client"
SET "onboardingStartedAt" = COALESCE("onboardingStartedAt", "createdAt")
WHERE "status" = 'ONBOARDING' AND "onboardingStartedAt" IS NULL;

UPDATE "Client"
SET "offboardedAt" = COALESCE("offboardedAt", "updatedAt"),
    "status" = 'OFFBOARDED'
WHERE "status" = 'INACTIVE';

INSERT INTO "ClientOnboarding" ("id", "organizationId", "clientId", "status", "currentStep", "startedAt", "completedAt", "createdAt", "updatedAt")
SELECT
  'onb_' || c."id",
  c."organizationId",
  c."id",
  CASE
    WHEN c."status" = 'ACTIVE' THEN 'COMPLETED'::"ClientOnboardingStatus"
    WHEN c."status" = 'ONBOARDING' THEN 'IN_PROGRESS'::"ClientOnboardingStatus"
    WHEN c."status" IN ('OFFBOARDED', 'SUSPENDED') THEN 'BLOCKED'::"ClientOnboardingStatus"
    ELSE 'NOT_STARTED'::"ClientOnboardingStatus"
  END,
  CASE
    WHEN c."status" = 'ACTIVE' THEN 'REVIEW'::"ClientOnboardingStep"
    ELSE 'CLIENT_PROFILE'::"ClientOnboardingStep"
  END,
  COALESCE(c."onboardingStartedAt", c."createdAt"),
  CASE WHEN c."status" = 'ACTIVE' THEN COALESCE(c."activatedAt", c."createdAt") ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE NOT EXISTS (
  SELECT 1 FROM "ClientOnboarding" o WHERE o."clientId" = c."id"
);
