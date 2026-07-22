import type {
  SecurityEventSeverity,
  SecurityEventStatus,
} from "@prisma/client";
import { z } from "zod";

export const securityEventSeveritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);

export const securityEventStatusSchema = z.enum([
  "NEW",
  "REVIEWING",
  "ACKNOWLEDGED",
  "ESCALATED",
  "DISMISSED",
]);

export const securityEventFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  severity: securityEventSeveritySchema.optional(),
  status: securityEventStatusSchema.optional(),
  classification: z
    .enum(["ACTIONABLE", "INFORMATIONAL", "NOISY", "IGNORED"])
    .optional(),
  source: z.enum(["WAZUH"]).optional(),
  clientId: z.string().cuid().optional(),
  assetId: z.string().cuid().optional(),
  agentId: z.string().max(32).optional(),
  ruleId: z.string().max(32).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sort: z.enum(["newest", "oldest"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type SecurityEventFiltersInput = z.infer<
  typeof securityEventFiltersSchema
>;

export const dismissSecurityEventSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export type DismissSecurityEventInput = z.infer<
  typeof dismissSecurityEventSchema
>;

export const escalateSecurityEventSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  severity: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])
    .optional(),
  category: z
    .enum([
      "MALWARE",
      "PHISHING",
      "ACCOUNT_COMPROMISE",
      "UNAUTHORIZED_ACCESS",
      "BRUTE_FORCE",
      "DATA_EXPOSURE",
      "DATA_EXFILTRATION",
      "WEB_ATTACK",
      "DENIAL_OF_SERVICE",
      "VULNERABILITY_EXPLOITATION",
      "SUSPICIOUS_ACTIVITY",
      "POLICY_VIOLATION",
      "IOT_SECURITY",
      "OTHER",
    ])
    .optional(),
  assetId: z.string().cuid().optional(),
  assignedToUserId: z.string().cuid().optional(),
});

export type EscalateSecurityEventInput = z.infer<
  typeof escalateSecurityEventSchema
>;

export const linkSecurityEventToIncidentSchema = z.object({
  securityEventId: z.string().cuid(),
  incidentId: z.string().cuid(),
});

export type LinkSecurityEventToIncidentInput = z.infer<
  typeof linkSecurityEventToIncidentSchema
>;

export const wazuhAgentMappingSchema = z.object({
  wazuhAgentId: z.string().min(1).max(32),
  wazuhAgentName: z.string().max(255).optional(),
  clientId: z.string().cuid(),
  assetId: z.string().cuid(),
});

export type WazuhAgentMappingInput = z.infer<typeof wazuhAgentMappingSchema>;

export const wazuhSyncSchema = z.object({
  mode: z.enum(["FROM_NOW", "LAST_1H", "LAST_24H"]),
  continueFromCheckpoint: z.boolean().optional(),
});

export type WazuhSyncInput = z.infer<typeof wazuhSyncSchema>;

export function mapSeverityLabel(severity: SecurityEventSeverity): string {
  return severity;
}

export function mapStatusLabel(status: SecurityEventStatus): string {
  return status.replace(/_/g, " ");
}
