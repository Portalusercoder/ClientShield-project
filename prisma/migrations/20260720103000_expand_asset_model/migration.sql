-- Expand AssetType enum
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'WEB_APPLICATION';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'IOT_DEVICE';

-- Create new enums
CREATE TYPE "AssetEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'OTHER');
CREATE TYPE "AssetMonitoringStatus" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE');
CREATE TYPE "AssetAuthorizationStatus" AS ENUM ('AUTHORIZED', 'PENDING', 'NOT_AUTHORIZED');

-- Add new Asset columns
ALTER TABLE "Asset"
  ADD COLUMN "hostname" TEXT,
  ADD COLUMN "environment" "AssetEnvironment" NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN "monitoringStatus" "AssetMonitoringStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "authorizationStatus" "AssetAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "securityScore" DOUBLE PRECISION,
  ADD COLUMN "lastSecurityCheckAt" TIMESTAMP(3);

-- Migrate isMonitored boolean to monitoringStatus
UPDATE "Asset"
SET "monitoringStatus" = CASE
  WHEN "isMonitored" = true THEN 'ACTIVE'::"AssetMonitoringStatus"
  ELSE 'INACTIVE'::"AssetMonitoringStatus"
END;

-- Drop legacy column
ALTER TABLE "Asset" DROP COLUMN "isMonitored";

-- Indexes
CREATE INDEX "Asset_type_idx" ON "Asset"("type");
CREATE INDEX "Asset_criticality_idx" ON "Asset"("criticality");
CREATE INDEX "Asset_monitoringStatus_idx" ON "Asset"("monitoringStatus");
CREATE INDEX "Asset_authorizationStatus_idx" ON "Asset"("authorizationStatus");
