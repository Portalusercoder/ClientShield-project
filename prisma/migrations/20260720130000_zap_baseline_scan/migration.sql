-- Add ScanStatus values for ZAP baseline workflow (separate from data using them if needed)
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "Scan"
  ADD COLUMN IF NOT EXISTS "scannerVersion" TEXT;
