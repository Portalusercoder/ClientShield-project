import { z } from "zod";

export const incidentSeveritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);

export const incidentStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "CONTAINED",
  "ERADICATED",
  "RECOVERING",
  "RESOLVED",
  "CLOSED",
]);

export const incidentCategorySchema = z.enum([
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
]);

export const incidentSourceSchema = z.enum([
  "MANUAL",
  "FINDING",
  "WAZUH",
  "OWASP_ZAP",
  "PASSIVE_CHECK",
  "OTHER",
]);

export const incidentDetectionMethodSchema = z.enum([
  "MANUAL",
  "SIEM",
  "EDR",
  "IDS_IPS",
  "VULNERABILITY_SCANNER",
  "WEB_MONITORING",
  "USER_REPORT",
  "OTHER",
]);

const optionalId = z
  .string()
  .trim()
  .min(1)
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v === "" || v == null ? null : v));

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v === "" || v == null ? null : v))
  .refine(
    (v) => v == null || !Number.isNaN(new Date(v).getTime()),
    "Invalid date"
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? null : v));

export const createIncidentSchema = z.object({
  clientId: z.string().trim().min(1, "Client is required"),
  assetId: optionalId,
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().min(1, "Description is required").max(5000),
  severity: incidentSeveritySchema,
  category: incidentCategorySchema,
  source: incidentSourceSchema.optional().default("MANUAL"),
  detectionMethod: incidentDetectionMethodSchema.optional().default("MANUAL"),
  externalSourceId: z.string().trim().max(200).nullable().optional(),
  assignedToUserId: optionalId,
  occurredAt: optionalDate,
  businessImpact: optionalText(2000),
  technicalImpact: optionalText(2000),
  findingId: optionalId,
});

export const updateIncidentSeveritySchema = z.object({
  severity: incidentSeveritySchema,
});

export const updateIncidentStatusSchema = z.object({
  status: incidentStatusSchema,
  /** Required when reopening RESOLVED/CLOSED → INVESTIGATING */
  reason: optionalText(2000),
  /** Required when closing */
  closingNote: optionalText(5000),
});

export const assignIncidentSchema = z.object({
  assignedToUserId: optionalId,
});

export const updateIncidentResponseSchema = z
  .object({
    rootCause: optionalText(5000),
    containmentSummary: optionalText(5000),
    eradicationSummary: optionalText(5000),
    recoverySummary: optionalText(5000),
    resolutionSummary: optionalText(5000),
    lessonsLearned: optionalText(5000),
    businessImpact: optionalText(2000),
    technicalImpact: optionalText(2000),
    impactSummary: optionalText(5000),
    scopeSummary: optionalText(5000),
    whatWentWell: optionalText(5000),
    whatCouldImprove: optionalText(5000),
    followUpActions: optionalText(5000),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== null && v !== undefined),
    { message: "At least one response field is required" }
  );

export const addIncidentNoteSchema = z.object({
  content: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export const linkFindingSchema = z.object({
  findingId: z.string().trim().min(1, "Finding is required"),
});

export const escalateFindingSchema = z.object({
  findingId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? undefined : v)),
  severity: incidentSeveritySchema.optional(),
  category: incidentCategorySchema.optional().default("VULNERABILITY_EXPLOITATION"),
});

export const incidentFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  caseNumber: z.string().trim().max(32).optional(),
  clientId: z.string().optional().default("ALL"),
  assetId: z.string().optional().default("ALL"),
  severity: z
    .union([incidentSeveritySchema, z.literal("ALL")])
    .optional()
    .default("ALL"),
  status: z
    .union([incidentStatusSchema, z.literal("ALL")])
    .optional()
    .default("ALL"),
  category: z
    .union([incidentCategorySchema, z.literal("ALL")])
    .optional()
    .default("ALL"),
  source: z
    .union([incidentSourceSchema, z.literal("ALL")])
    .optional()
    .default("ALL"),
  assignedToUserId: z.string().optional().default("ALL"),
  leadAnalystUserId: z.string().optional().default("ALL"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  detectedFrom: optionalDate,
  detectedTo: optionalDate,
  sortBy: z
    .enum([
      "detectedAt",
      "updatedAt",
      "severity",
      "status",
      "title",
      "caseNumber",
    ])
    .optional()
    .default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentSeverityInput = z.infer<
  typeof updateIncidentSeveritySchema
>;
export type UpdateIncidentStatusInput = z.infer<
  typeof updateIncidentStatusSchema
>;
export type AssignIncidentInput = z.infer<typeof assignIncidentSchema>;
export type UpdateIncidentResponseInput = z.infer<
  typeof updateIncidentResponseSchema
>;
export type AddIncidentNoteInput = z.infer<typeof addIncidentNoteSchema>;
export type LinkFindingInput = z.infer<typeof linkFindingSchema>;
export type EscalateFindingInput = z.infer<typeof escalateFindingSchema>;
export type IncidentFiltersInput = z.infer<typeof incidentFiltersSchema>;
