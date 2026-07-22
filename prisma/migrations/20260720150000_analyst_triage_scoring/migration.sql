-- CreateEnum
CREATE TYPE "TriagePriority" AS ENUM ('P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW', 'P5_INFORMATIONAL');

-- CreateEnum
CREATE TYPE "BusinessImpact" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExploitabilityAssessment" AS ENUM ('UNLIKELY', 'POSSIBLE', 'LIKELY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemediationComplexity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AssessmentCoverage" AS ENUM ('LIMITED', 'BASIC');

-- AlterTable Finding — triage metadata
ALTER TABLE "Finding" ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validatedByUserId" TEXT,
ADD COLUMN     "validationNotes" TEXT,
ADD COLUMN     "analystNotes" TEXT,
ADD COLUMN     "triagePriority" "TriagePriority",
ADD COLUMN     "businessImpact" "BusinessImpact",
ADD COLUMN     "exploitabilityAssessment" "ExploitabilityAssessment",
ADD COLUMN     "remediationComplexity" "RemediationComplexity";

-- CreateTable
CREATE TABLE "SecurityScoreSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "assetId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "coverage" "AssessmentCoverage",
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "SecurityScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SecurityScoreSnapshot" ADD CONSTRAINT "SecurityScoreSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityScoreSnapshot" ADD CONSTRAINT "SecurityScoreSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityScoreSnapshot" ADD CONSTRAINT "SecurityScoreSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Finding_triagePriority_idx" ON "Finding"("triagePriority");

CREATE INDEX "Finding_validatedByUserId_idx" ON "Finding"("validatedByUserId");

CREATE INDEX "SecurityScoreSnapshot_organizationId_idx" ON "SecurityScoreSnapshot"("organizationId");

CREATE INDEX "SecurityScoreSnapshot_clientId_idx" ON "SecurityScoreSnapshot"("clientId");

CREATE INDEX "SecurityScoreSnapshot_assetId_idx" ON "SecurityScoreSnapshot"("assetId");

CREATE INDEX "SecurityScoreSnapshot_calculatedAt_idx" ON "SecurityScoreSnapshot"("calculatedAt");

CREATE INDEX "SecurityScoreSnapshot_organizationId_assetId_calculatedAt_idx" ON "SecurityScoreSnapshot"("organizationId", "assetId", "calculatedAt");
