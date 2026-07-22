-- FindingInstance: affected locations for aggregated findings (esp. OWASP ZAP)
CREATE TABLE IF NOT EXISTS "FindingInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "scanId" TEXT,
    "instanceKey" TEXT NOT NULL,
    "url" TEXT,
    "normalizedPath" TEXT NOT NULL,
    "httpMethod" TEXT,
    "parameter" TEXT,
    "evidence" JSONB,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FindingInstance_findingId_instanceKey_key"
  ON "FindingInstance"("findingId", "instanceKey");

CREATE INDEX IF NOT EXISTS "FindingInstance_organizationId_idx" ON "FindingInstance"("organizationId");
CREATE INDEX IF NOT EXISTS "FindingInstance_findingId_idx" ON "FindingInstance"("findingId");
CREATE INDEX IF NOT EXISTS "FindingInstance_scanId_idx" ON "FindingInstance"("scanId");
CREATE INDEX IF NOT EXISTS "FindingInstance_normalizedPath_idx" ON "FindingInstance"("normalizedPath");
CREATE INDEX IF NOT EXISTS "FindingInstance_lastDetectedAt_idx" ON "FindingInstance"("lastDetectedAt");

DO $$ BEGIN
  ALTER TABLE "FindingInstance"
    ADD CONSTRAINT "FindingInstance_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FindingInstance"
    ADD CONSTRAINT "FindingInstance_findingId_fkey"
    FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FindingInstance"
    ADD CONSTRAINT "FindingInstance_scanId_fkey"
    FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
