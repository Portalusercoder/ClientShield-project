-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ONBOARDING');

-- AlterTable: add new columns (slug nullable initially for safe migration)
ALTER TABLE "Client"
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "primaryContactEmail" TEXT,
  ADD COLUMN "primaryContactName" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" "ClientStatus" NOT NULL DEFAULT 'ONBOARDING',
  ADD COLUMN "website" TEXT;

-- Migrate existing data from old columns
UPDATE "Client"
SET
  "primaryContactEmail" = "contactEmail",
  "primaryContactName" = "contactName",
  "status" = CASE WHEN "isActive" = true THEN 'ACTIVE'::"ClientStatus" ELSE 'INACTIVE'::"ClientStatus" END,
  "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
WHERE "slug" IS NULL;

-- Ensure slug is set for any remaining rows
UPDATE "Client" SET "slug" = 'client-' || "id" WHERE "slug" IS NULL OR "slug" = '';

-- Drop old columns and enforce slug NOT NULL
ALTER TABLE "Client"
  DROP COLUMN "contactEmail",
  DROP COLUMN "contactName",
  DROP COLUMN "isActive",
  ALTER COLUMN "slug" SET NOT NULL,
  ALTER COLUMN "securityScore" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");
CREATE INDEX "Client_industry_idx" ON "Client"("industry");
CREATE UNIQUE INDEX "Client_organizationId_slug_key" ON "Client"("organizationId", "slug");
