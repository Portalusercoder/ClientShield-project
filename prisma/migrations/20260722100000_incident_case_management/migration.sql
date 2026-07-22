-- Incident Case Management: case numbers, playbooks, tasks, evidence, ownership

-- Enums
CREATE TYPE "PlaybookPhase" AS ENUM ('INVESTIGATION', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'POST_INCIDENT');
CREATE TYPE "ResponseTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED');
CREATE TYPE "ResponseTaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "EvidenceType" AS ENUM ('SECURITY_EVENT', 'FINDING', 'LOG', 'SCREENSHOT', 'DOCUMENT', 'FILE', 'NOTE', 'OTHER');

ALTER TYPE "IncidentActivityType" ADD VALUE 'PLAYBOOK_ASSIGNED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'TASK_CREATED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'TASK_STATUS_CHANGED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'EVIDENCE_ADDED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'COMMANDER_ASSIGNED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'LEAD_ANALYST_ASSIGNED';
ALTER TYPE "IncidentActivityType" ADD VALUE 'POST_INCIDENT_UPDATED';

ALTER TYPE "ReportType" ADD VALUE 'INCIDENT_CASE';

-- Incident extensions (caseNumber nullable until backfill)
ALTER TABLE "Incident"
  ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "declaredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leadAnalystUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "commanderUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "impactSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "scopeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "whatWentWell" TEXT,
  ADD COLUMN IF NOT EXISTS "whatCouldImprove" TEXT,
  ADD COLUMN IF NOT EXISTS "followUpActions" TEXT;

-- Case number sequence
CREATE TABLE IF NOT EXISTS "IncidentCaseSequence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "IncidentCaseSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IncidentCaseSequence_organizationId_year_key"
  ON "IncidentCaseSequence"("organizationId", "year");
CREATE INDEX IF NOT EXISTS "IncidentCaseSequence_organizationId_idx"
  ON "IncidentCaseSequence"("organizationId");

ALTER TABLE "IncidentCaseSequence"
  DROP CONSTRAINT IF EXISTS "IncidentCaseSequence_organizationId_fkey";
ALTER TABLE "IncidentCaseSequence"
  ADD CONSTRAINT "IncidentCaseSequence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill case numbers: INC-YYYY-NNNNNN per org+year by createdAt ASC
DO $$
DECLARE
  r RECORD;
  seq INT;
  yr INT;
  prev_org TEXT := '';
  prev_year INT := -1;
BEGIN
  FOR r IN
    SELECT "id", "organizationId", "createdAt"
    FROM "Incident"
    WHERE "caseNumber" IS NULL
    ORDER BY "organizationId", EXTRACT(YEAR FROM "createdAt")::INT, "createdAt" ASC, "id" ASC
  LOOP
    yr := EXTRACT(YEAR FROM r."createdAt")::INT;
    IF r."organizationId" IS DISTINCT FROM prev_org OR yr IS DISTINCT FROM prev_year THEN
      seq := 1;
      prev_org := r."organizationId";
      prev_year := yr;
    ELSE
      seq := seq + 1;
    END IF;
    UPDATE "Incident"
    SET "caseNumber" = 'INC-' || yr::TEXT || '-' || LPAD(seq::TEXT, 6, '0')
    WHERE "id" = r."id";
  END LOOP;
END $$;

-- Sync sequence counters to max backfilled values
INSERT INTO "IncidentCaseSequence" ("id", "organizationId", "year", "lastValue")
SELECT
  md5(random()::text || clock_timestamp()::text || "organizationId" || year::text),
  "organizationId",
  year,
  MAX(seq)
FROM (
  SELECT
    "organizationId",
    CAST(substring("caseNumber" FROM 5 FOR 4) AS INTEGER) AS year,
    CAST(substring("caseNumber" FROM 10) AS INTEGER) AS seq
  FROM "Incident"
  WHERE "caseNumber" ~ '^INC-[0-9]{4}-[0-9]{6}$'
) parsed
GROUP BY "organizationId", year
ON CONFLICT ("organizationId", "year") DO UPDATE
SET "lastValue" = GREATEST("IncidentCaseSequence"."lastValue", EXCLUDED."lastValue");

ALTER TABLE "Incident" ALTER COLUMN "caseNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Incident_organizationId_caseNumber_key"
  ON "Incident"("organizationId", "caseNumber");
CREATE INDEX IF NOT EXISTS "Incident_leadAnalystUserId_idx" ON "Incident"("leadAnalystUserId");
CREATE INDEX IF NOT EXISTS "Incident_commanderUserId_idx" ON "Incident"("commanderUserId");

ALTER TABLE "Incident" DROP CONSTRAINT IF EXISTS "Incident_leadAnalystUserId_fkey";
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_leadAnalystUserId_fkey"
  FOREIGN KEY ("leadAnalystUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" DROP CONSTRAINT IF EXISTS "Incident_commanderUserId_fkey";
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_commanderUserId_fkey"
  FOREIGN KEY ("commanderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Playbooks
CREATE TABLE IF NOT EXISTS "IncidentPlaybook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "IncidentCategory",
    "severity" "IncidentSeverity",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentPlaybook_organizationId_idx" ON "IncidentPlaybook"("organizationId");
CREATE INDEX IF NOT EXISTS "IncidentPlaybook_isSystemTemplate_idx" ON "IncidentPlaybook"("isSystemTemplate");
CREATE INDEX IF NOT EXISTS "IncidentPlaybook_isActive_idx" ON "IncidentPlaybook"("isActive");
CREATE INDEX IF NOT EXISTS "IncidentPlaybook_category_idx" ON "IncidentPlaybook"("category");

ALTER TABLE "IncidentPlaybook" DROP CONSTRAINT IF EXISTS "IncidentPlaybook_organizationId_fkey";
ALTER TABLE "IncidentPlaybook"
  ADD CONSTRAINT "IncidentPlaybook_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentPlaybook" DROP CONSTRAINT IF EXISTS "IncidentPlaybook_createdByUserId_fkey";
ALTER TABLE "IncidentPlaybook"
  ADD CONSTRAINT "IncidentPlaybook_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PlaybookStep" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "phase" "PlaybookPhase" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "defaultPriority" "ResponseTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaybookStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlaybookStep_playbookId_idx" ON "PlaybookStep"("playbookId");
CREATE INDEX IF NOT EXISTS "PlaybookStep_playbookId_order_idx" ON "PlaybookStep"("playbookId", "order");
ALTER TABLE "PlaybookStep" DROP CONSTRAINT IF EXISTS "PlaybookStep_playbookId_fkey";
ALTER TABLE "PlaybookStep"
  ADD CONSTRAINT "PlaybookStep_playbookId_fkey"
  FOREIGN KEY ("playbookId") REFERENCES "IncidentPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "IncidentPlaybookInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "sourcePlaybookId" TEXT,
    "playbookName" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT,
    CONSTRAINT "IncidentPlaybookInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentPlaybookInstance_organizationId_idx" ON "IncidentPlaybookInstance"("organizationId");
CREATE INDEX IF NOT EXISTS "IncidentPlaybookInstance_incidentId_idx" ON "IncidentPlaybookInstance"("incidentId");
CREATE INDEX IF NOT EXISTS "IncidentPlaybookInstance_sourcePlaybookId_idx" ON "IncidentPlaybookInstance"("sourcePlaybookId");

ALTER TABLE "IncidentPlaybookInstance" DROP CONSTRAINT IF EXISTS "IncidentPlaybookInstance_organizationId_fkey";
ALTER TABLE "IncidentPlaybookInstance"
  ADD CONSTRAINT "IncidentPlaybookInstance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentPlaybookInstance" DROP CONSTRAINT IF EXISTS "IncidentPlaybookInstance_incidentId_fkey";
ALTER TABLE "IncidentPlaybookInstance"
  ADD CONSTRAINT "IncidentPlaybookInstance_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentPlaybookInstance" DROP CONSTRAINT IF EXISTS "IncidentPlaybookInstance_sourcePlaybookId_fkey";
ALTER TABLE "IncidentPlaybookInstance"
  ADD CONSTRAINT "IncidentPlaybookInstance_sourcePlaybookId_fkey"
  FOREIGN KEY ("sourcePlaybookId") REFERENCES "IncidentPlaybook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentPlaybookInstance" DROP CONSTRAINT IF EXISTS "IncidentPlaybookInstance_assignedByUserId_fkey";
ALTER TABLE "IncidentPlaybookInstance"
  ADD CONSTRAINT "IncidentPlaybookInstance_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "IncidentResponseTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "playbookInstanceId" TEXT,
    "phase" "PlaybookPhase" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "ResponseTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ResponseTaskStatus" NOT NULL DEFAULT 'TODO',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "assignedToUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completionNote" TEXT,
    "blockedReason" TEXT,
    "skipReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentResponseTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentResponseTask_organizationId_idx" ON "IncidentResponseTask"("organizationId");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_incidentId_idx" ON "IncidentResponseTask"("incidentId");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_playbookInstanceId_idx" ON "IncidentResponseTask"("playbookInstanceId");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_status_idx" ON "IncidentResponseTask"("status");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_phase_idx" ON "IncidentResponseTask"("phase");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_assignedToUserId_idx" ON "IncidentResponseTask"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "IncidentResponseTask_organizationId_incidentId_idx" ON "IncidentResponseTask"("organizationId", "incidentId");

ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_organizationId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_incidentId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_playbookInstanceId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_playbookInstanceId_fkey"
  FOREIGN KEY ("playbookInstanceId") REFERENCES "IncidentPlaybookInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_assignedToUserId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_completedByUserId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentResponseTask" DROP CONSTRAINT IF EXISTS "IncidentResponseTask_createdByUserId_fkey";
ALTER TABLE "IncidentResponseTask"
  ADD CONSTRAINT "IncidentResponseTask_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "IncidentEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT,
    "sourceReferenceId" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "storageKey" TEXT,
    "sha256" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentEvidence_organizationId_idx" ON "IncidentEvidence"("organizationId");
CREATE INDEX IF NOT EXISTS "IncidentEvidence_incidentId_idx" ON "IncidentEvidence"("incidentId");
CREATE INDEX IF NOT EXISTS "IncidentEvidence_type_idx" ON "IncidentEvidence"("type");
CREATE INDEX IF NOT EXISTS "IncidentEvidence_incidentId_type_sourceReferenceId_idx"
  ON "IncidentEvidence"("incidentId", "type", "sourceReferenceId");

ALTER TABLE "IncidentEvidence" DROP CONSTRAINT IF EXISTS "IncidentEvidence_organizationId_fkey";
ALTER TABLE "IncidentEvidence"
  ADD CONSTRAINT "IncidentEvidence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentEvidence" DROP CONSTRAINT IF EXISTS "IncidentEvidence_incidentId_fkey";
ALTER TABLE "IncidentEvidence"
  ADD CONSTRAINT "IncidentEvidence_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentEvidence" DROP CONSTRAINT IF EXISTS "IncidentEvidence_collectedByUserId_fkey";
ALTER TABLE "IncidentEvidence"
  ADD CONSTRAINT "IncidentEvidence_collectedByUserId_fkey"
  FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional incident link on Report
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "incidentId" TEXT;
CREATE INDEX IF NOT EXISTS "Report_incidentId_idx" ON "Report"("incidentId");
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_incidentId_fkey";
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed system playbooks (idempotent by fixed IDs)
INSERT INTO "IncidentPlaybook" ("id", "organizationId", "name", "description", "category", "severity", "isActive", "isSystemTemplate", "createdAt", "updatedAt")
VALUES
  ('syspb_malware_investigation', NULL, 'Malware Investigation', 'Analyst checklist for suspected malware on an endpoint. Documentation only — no automated containment.', 'MALWARE', 'HIGH', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('syspb_suspicious_auth', NULL, 'Suspicious Authentication Activity', 'Investigate anomalous login or authentication events.', 'ACCOUNT_COMPROMISE', 'HIGH', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('syspb_endpoint_alert', NULL, 'Endpoint Security Alert', 'Response workflow for EDR/SIEM endpoint alerts.', 'SUSPICIOUS_ACTIVITY', 'MEDIUM', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('syspb_web_app_incident', NULL, 'Web Application Security Incident', 'Investigate and document web application attacks or escalated findings.', 'WEB_ATTACK', 'HIGH', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('syspb_unauthorized_access', NULL, 'Unauthorized Access', 'Investigate suspected unauthorized access to systems or data.', 'UNAUTHORIZED_ACCESS', 'HIGH', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('syspb_generic_security', NULL, 'Generic Security Incident', 'General-purpose IR checklist when no specialized playbook applies.', 'OTHER', 'MEDIUM', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Steps (delete+reinsert for idempotent seed of known system playbooks)
DELETE FROM "PlaybookStep" WHERE "playbookId" LIKE 'syspb_%';

INSERT INTO "PlaybookStep" ("id", "playbookId", "order", "phase", "title", "description", "isRequired", "defaultPriority", "createdAt", "updatedAt") VALUES
-- Malware
('syspb_malware_s1', 'syspb_malware_investigation', 1, 'INVESTIGATION', 'Confirm alert authenticity', 'Validate detection source and false-positive likelihood.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_malware_s2', 'syspb_malware_investigation', 2, 'INVESTIGATION', 'Identify affected host and user', 'Document asset, user, process, and initial infection vector hypotheses.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_malware_s3', 'syspb_malware_investigation', 3, 'CONTAINMENT', 'Document containment actions taken', 'Record isolation or network restrictions performed outside ClientShield.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_malware_s4', 'syspb_malware_investigation', 4, 'ERADICATION', 'Document malware removal', 'Record remediation steps and verification of cleanup.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_malware_s5', 'syspb_malware_investigation', 5, 'RECOVERY', 'Validate host restored to service', 'Confirm monitoring healthy and user can resume work.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_malware_s6', 'syspb_malware_investigation', 6, 'POST_INCIDENT', 'Capture lessons learned', 'Document root cause and preventive follow-ups.', false, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Auth
('syspb_auth_s1', 'syspb_suspicious_auth', 1, 'INVESTIGATION', 'Review authentication telemetry', 'Correlate login times, locations, MFA status, and failed attempts.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_auth_s2', 'syspb_suspicious_auth', 2, 'INVESTIGATION', 'Identify impacted accounts', 'List accounts and privileges potentially involved.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_auth_s3', 'syspb_suspicious_auth', 3, 'CONTAINMENT', 'Document account containment', 'Record password resets, session revocation, or MFA enforcement done externally.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_auth_s4', 'syspb_suspicious_auth', 4, 'ERADICATION', 'Remove persistence / backdoors', 'Document cleanup of malicious MFA methods, tokens, or rules.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_auth_s5', 'syspb_suspicious_auth', 5, 'RECOVERY', 'Restore legitimate access', 'Confirm user recovery and monitoring in place.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_auth_s6', 'syspb_suspicious_auth', 6, 'POST_INCIDENT', 'Hardening recommendations', 'Record identity control improvements.', false, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Endpoint
('syspb_ep_s1', 'syspb_endpoint_alert', 1, 'INVESTIGATION', 'Triage endpoint alert', 'Review rule, process tree, and host context.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ep_s2', 'syspb_endpoint_alert', 2, 'INVESTIGATION', 'Determine blast radius', 'Check related hosts, users, and lateral movement indicators.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ep_s3', 'syspb_endpoint_alert', 3, 'CONTAINMENT', 'Document endpoint containment', 'Record isolation or policy changes performed externally.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ep_s4', 'syspb_endpoint_alert', 4, 'ERADICATION', 'Remediate root cause on endpoint', 'Document cleanup and confirmation scans.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ep_s5', 'syspb_endpoint_alert', 5, 'RECOVERY', 'Return endpoint to production', 'Validate health checks and monitoring.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Web
('syspb_web_s1', 'syspb_web_app_incident', 1, 'INVESTIGATION', 'Confirm web attack or finding impact', 'Validate exploitability and affected URL/asset.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_web_s2', 'syspb_web_app_incident', 2, 'INVESTIGATION', 'Collect request/response evidence', 'Link findings or logs; do not store credentials.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_web_s3', 'syspb_web_app_incident', 3, 'CONTAINMENT', 'Document WAF / access mitigation', 'Record mitigations applied outside ClientShield.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_web_s4', 'syspb_web_app_incident', 4, 'ERADICATION', 'Track code or config fix', 'Link remediation tasks or document patch status.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_web_s5', 'syspb_web_app_incident', 5, 'RECOVERY', 'Verify fix and monitoring', 'Confirm retest results and alert coverage.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_web_s6', 'syspb_web_app_incident', 6, 'POST_INCIDENT', 'Document preventive controls', 'Capture SDLC or config hardening follow-ups.', false, 'LOW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Unauthorized access
('syspb_ua_s1', 'syspb_unauthorized_access', 1, 'INVESTIGATION', 'Establish timeline of access', 'Map who, what, when, and where.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ua_s2', 'syspb_unauthorized_access', 2, 'INVESTIGATION', 'Assess data exposure', 'Document systems and data potentially accessed.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ua_s3', 'syspb_unauthorized_access', 3, 'CONTAINMENT', 'Document access revocation', 'Record credential and session containment steps.', true, 'CRITICAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ua_s4', 'syspb_unauthorized_access', 4, 'ERADICATION', 'Remove unauthorized footholds', 'Document cleanup of accounts, keys, or implants.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ua_s5', 'syspb_unauthorized_access', 5, 'RECOVERY', 'Restore trusted access paths', 'Validate legitimate users restored safely.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_ua_s6', 'syspb_unauthorized_access', 6, 'POST_INCIDENT', 'Notify stakeholders as required', 'Document notifications and follow-ups.', false, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
-- Generic
('syspb_gen_s1', 'syspb_generic_security', 1, 'INVESTIGATION', 'Define incident scope', 'Summarize what is known and unknown.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_gen_s2', 'syspb_generic_security', 2, 'INVESTIGATION', 'Collect evidence references', 'Link Security Events, Findings, and notes.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_gen_s3', 'syspb_generic_security', 3, 'CONTAINMENT', 'Document containment measures', 'Record actions taken outside the platform.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_gen_s4', 'syspb_generic_security', 4, 'ERADICATION', 'Document eradication steps', 'Record removal of threat artifacts.', true, 'HIGH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_gen_s5', 'syspb_generic_security', 5, 'RECOVERY', 'Document recovery verification', 'Confirm services restored and monitored.', true, 'MEDIUM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('syspb_gen_s6', 'syspb_generic_security', 6, 'POST_INCIDENT', 'Record lessons learned', 'Capture improvements and open follow-ups.', false, 'LOW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
