import { z } from "zod";

export const investigationStatusSchema = z.enum([
  "OPEN",
  "INVESTIGATING",
  "CONFIRMED",
  "DISMISSED",
  "LINKED_TO_INCIDENT",
  "CLOSED",
]);

export const investigationCreatedByTypeSchema = z.enum([
  "SYSTEM_SUGGESTED",
  "ANALYST_CREATED",
]);

export const correlationConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const correlationCandidateStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
]);

export const investigationFiltersSchema = z.object({
  status: investigationStatusSchema.optional(),
  createdByType: investigationCreatedByTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const createInvestigationSchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(5000).nullable().optional(),
  severity: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])
    .optional(),
  securityEventIds: z.array(z.string().min(1)).min(1).max(100),
  groupingExplanation: z.string().trim().max(5000).nullable().optional(),
});

export const addInvestigationEventSchema = z.object({
  groupId: z.string().min(1),
  securityEventId: z.string().min(1),
});

export const removeInvestigationEventSchema = z.object({
  groupId: z.string().min(1),
  securityEventId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
});

export const dismissInvestigationSchema = z.object({
  groupId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
});

export const acceptCorrelationCandidateSchema = z.object({
  candidateId: z.string().min(1),
});

export const rejectCorrelationCandidateSchema = z.object({
  candidateId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000).optional(),
});

export const linkInvestigationToIncidentSchema = z.object({
  groupId: z.string().min(1),
  incidentId: z.string().min(1),
});

export const createIncidentFromInvestigationSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  severity: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])
    .optional(),
  category: z.string().optional(),
  /** Explicit analyst confirmation required at the action layer. */
  confirm: z.literal(true),
});

export const threatIntelLookupSchema = z.object({
  observableId: z.string().min(1),
  /** Explicit analyst confirmation required at the action layer. */
  confirm: z.literal(true),
});

export type InvestigationFiltersInput = z.infer<
  typeof investigationFiltersSchema
>;
export type CreateInvestigationInput = z.infer<
  typeof createInvestigationSchema
>;
export type CreateIncidentFromInvestigationInput = z.infer<
  typeof createIncidentFromInvestigationSchema
>;
export type ThreatIntelLookupInput = z.infer<typeof threatIntelLookupSchema>;
