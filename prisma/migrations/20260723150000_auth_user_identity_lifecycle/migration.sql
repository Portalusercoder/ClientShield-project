-- Additive only: auth user lifecycle fields (Phase 5).
-- No DROP / TRUNCATE / destructive ALTER / historical data deletion.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");

-- Partial unique: one User per external IdP subject when linked
CREATE UNIQUE INDEX "User_externalId_key"
  ON "User" ("externalId")
  WHERE "externalId" IS NOT NULL;
