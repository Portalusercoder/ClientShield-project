-- CreateEnum
CREATE TYPE "AttentionSourceType" AS ENUM ('SECURITY_EVENT', 'FINDING', 'INVESTIGATION', 'INCIDENT');

-- CreateTable
CREATE TABLE "SocAttentionState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" "AttentionSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "eligibilityGeneration" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocAttentionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocAttentionUserSnooze" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "AttentionSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "eligibilityGeneration" TEXT NOT NULL,
    "snoozedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocAttentionUserSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocAttentionState_organizationId_idx" ON "SocAttentionState"("organizationId");

-- CreateIndex
CREATE INDEX "SocAttentionState_organizationId_acknowledgedAt_idx" ON "SocAttentionState"("organizationId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "SocAttentionState_organizationId_claimedByUserId_idx" ON "SocAttentionState"("organizationId", "claimedByUserId");

-- CreateIndex
CREATE INDEX "SocAttentionState_organizationId_sourceType_sourceId_idx" ON "SocAttentionState"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "SocAttentionState_acknowledgedByUserId_idx" ON "SocAttentionState"("acknowledgedByUserId");

-- CreateIndex
CREATE INDEX "SocAttentionState_claimedByUserId_idx" ON "SocAttentionState"("claimedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SocAttentionState_organizationId_sourceType_sourceId_eligibilityGeneration_key" ON "SocAttentionState"("organizationId", "sourceType", "sourceId", "eligibilityGeneration");

-- CreateIndex
CREATE INDEX "SocAttentionUserSnooze_userId_snoozedUntil_idx" ON "SocAttentionUserSnooze"("userId", "snoozedUntil");

-- CreateIndex
CREATE INDEX "SocAttentionUserSnooze_organizationId_snoozedUntil_idx" ON "SocAttentionUserSnooze"("organizationId", "snoozedUntil");

-- CreateIndex
CREATE INDEX "SocAttentionUserSnooze_organizationId_userId_idx" ON "SocAttentionUserSnooze"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocAttentionUserSnooze_organizationId_userId_sourceType_sourceId_eligibilityGeneration_key" ON "SocAttentionUserSnooze"("organizationId", "userId", "sourceType", "sourceId", "eligibilityGeneration");

-- AddForeignKey
ALTER TABLE "SocAttentionState" ADD CONSTRAINT "SocAttentionState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocAttentionState" ADD CONSTRAINT "SocAttentionState_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocAttentionState" ADD CONSTRAINT "SocAttentionState_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocAttentionUserSnooze" ADD CONSTRAINT "SocAttentionUserSnooze_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocAttentionUserSnooze" ADD CONSTRAINT "SocAttentionUserSnooze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
