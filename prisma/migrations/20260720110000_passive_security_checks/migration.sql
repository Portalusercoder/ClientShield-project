-- AlterTable Scan: add passive security check result fields
ALTER TABLE "Scan"
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "overallScore" DOUBLE PRECISION,
  ADD COLUMN "summary" JSONB,
  ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "Scan_scanType_idx" ON "Scan"("scanType");

-- AlterTable Finding: add deduplication code and resolvedAt
ALTER TABLE "Finding"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "Finding_code_idx" ON "Finding"("code");
CREATE INDEX "Finding_organizationId_assetId_code_idx" ON "Finding"("organizationId", "assetId", "code");
