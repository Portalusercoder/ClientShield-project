-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('EXECUTIVE_SUMMARY', 'SECURITY_POSTURE', 'TECHNICAL_FINDINGS', 'REMEDIATION_STATUS');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED', 'ARCHIVED');

-- Drop legacy Report table and recreate with full schema (no production report data expected)
DROP TABLE IF EXISTS "Report";

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reportType" "ReportType" NOT NULL DEFAULT 'SECURITY_POSTURE',
    "title" TEXT NOT NULL,
    "reportingPeriodStart" TIMESTAMP(3) NOT NULL,
    "reportingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "generatedData" JSONB,
    "fileName" TEXT,
    "storageKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Report_organizationId_idx" ON "Report"("organizationId");
CREATE INDEX "Report_clientId_idx" ON "Report"("clientId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_reportType_idx" ON "Report"("reportType");
CREATE INDEX "Report_generatedAt_idx" ON "Report"("generatedAt");
CREATE INDEX "Report_organizationId_clientId_reportType_idx" ON "Report"("organizationId", "clientId", "reportType");

ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
