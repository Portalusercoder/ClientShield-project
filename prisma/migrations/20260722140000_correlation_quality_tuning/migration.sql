-- Correlation quality tuning: signal metadata, investigation fingerprint/quality, indexes

ALTER TABLE "CorrelationCandidate" ADD COLUMN IF NOT EXISTS "signalFamilies" JSONB;
ALTER TABLE "CorrelationCandidate" ADD COLUMN IF NOT EXISTS "qualityFactors" JSONB;

CREATE INDEX IF NOT EXISTS "CorrelationCandidate_expiresAt_idx" ON "CorrelationCandidate"("expiresAt");
CREATE INDEX IF NOT EXISTS "CorrelationCandidate_organizationId_status_expiresAt_idx" ON "CorrelationCandidate"("organizationId", "status", "expiresAt");

ALTER TABLE "InvestigationGroup" ADD COLUMN IF NOT EXISTS "confidence" "CorrelationConfidence";
ALTER TABLE "InvestigationGroup" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;
ALTER TABLE "InvestigationGroup" ADD COLUMN IF NOT EXISTS "qualitySummary" JSONB;
ALTER TABLE "InvestigationGroup" ADD COLUMN IF NOT EXISTS "qualityWarning" TEXT;

CREATE INDEX IF NOT EXISTS "InvestigationGroup_fingerprint_idx" ON "InvestigationGroup"("fingerprint");
CREATE INDEX IF NOT EXISTS "InvestigationGroup_organizationId_fingerprint_idx" ON "InvestigationGroup"("organizationId", "fingerprint");

ALTER TABLE "InvestigationGroupEvent" ADD COLUMN IF NOT EXISTS "addReason" TEXT;
