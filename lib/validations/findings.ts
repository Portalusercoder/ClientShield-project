import { z } from "zod";

export const findingStatusSchema = z.enum([
  "OPEN",
  "VALIDATED",
  "IN_PROGRESS",
  "RESOLVED",
  "ACCEPTED_RISK",
  "FALSE_POSITIVE",
]);

export const findingSeveritySchema = z.enum([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const findingSourceSchema = z.enum([
  "PASSIVE_CHECK",
  "OWASP_ZAP",
  "MANUAL",
  "OTHER",
]);

export const triagePrioritySchema = z.enum([
  "P1_CRITICAL",
  "P2_HIGH",
  "P3_MEDIUM",
  "P4_LOW",
  "P5_INFORMATIONAL",
]);

export const businessImpactSchema = z.enum([
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
]);

export const exploitabilitySchema = z.enum([
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "UNKNOWN",
]);

export const remediationComplexitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "UNKNOWN",
]);

/** Due date must be today or future (date-only YYYY-MM-DD or ISO). */
function assertNotPastDueDate(
  value: string | null | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[]
) {
  if (!value) return;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Invalid due date",
    });
    return;
  }
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Compare calendar day for YYYY-MM-DD
  const asDay = value.length === 10 ? new Date(`${value}T00:00:00`) : d;
  if (asDay.getTime() < startOfToday.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Due date cannot be in the past",
    });
  }
}

export const updateFindingStatusSchema = z
  .object({
    status: findingStatusSchema,
    reason: z.string().trim().max(2000).optional(),
    validationNotes: z.string().trim().max(2000).optional(),
    acceptedRiskReviewDate: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v)),
  })
  .superRefine((data, ctx) => {
    if (
      (data.status === "FALSE_POSITIVE" ||
        data.status === "ACCEPTED_RISK" ||
        data.status === "RESOLVED") &&
      !data.reason?.trim()
    ) {
      // RESOLVED reason required for ZAP/manual; enforced further in service for source
      if (
        data.status === "FALSE_POSITIVE" ||
        data.status === "ACCEPTED_RISK"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: "A reason is required for this status change",
        });
      }
    }
  });

export const assignFindingSchema = z
  .object({
    assignedToUserId: z
      .string()
      .cuid("Invalid user ID")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),
    dueDate: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
  })
  .superRefine((data, ctx) => {
    assertNotPastDueDate(data.dueDate ?? undefined, ctx, ["dueDate"]);
  });

export const updateFindingTriageSchema = z.object({
  triagePriority: triagePrioritySchema.optional().nullable(),
  businessImpact: businessImpactSchema.optional().nullable(),
  exploitabilityAssessment: exploitabilitySchema.optional().nullable(),
  remediationComplexity: remediationComplexitySchema.optional().nullable(),
  analystNotes: z.string().trim().max(4000).optional().nullable(),
  validationNotes: z.string().trim().max(2000).optional().nullable(),
});

export const findingNoteSchema = z.object({
  note: z.string().trim().min(1, "Note is required").max(2000),
});

export const findingFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  clientId: z.string().optional(),
  assetId: z.string().optional(),
  severity: z.union([findingSeveritySchema, z.literal("ALL")]).optional(),
  status: z.union([findingStatusSchema, z.literal("ALL")]).optional(),
  source: z.union([findingSourceSchema, z.literal("ALL")]).optional(),
  triagePriority: z.union([triagePrioritySchema, z.literal("ALL")]).optional(),
  needsTriage: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
  assignedToUserId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const remediationStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

export const remediationPrioritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const createRemediationTaskSchema = z
  .object({
    findingId: z.string().cuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    priority: remediationPrioritySchema.default("MEDIUM"),
    assignedToUserId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v)),
    dueDate: z.string().optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    confirmUnvalidated: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
  })
  .superRefine((data, ctx) => {
    assertNotPastDueDate(data.dueDate || undefined, ctx, ["dueDate"]);
  });

export const updateRemediationTaskSchema = z
  .object({
    status: remediationStatusSchema.optional(),
    priority: remediationPrioritySchema.optional(),
    assignedToUserId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),
    dueDate: z.string().optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dueDate) {
      assertNotPastDueDate(data.dueDate, ctx, ["dueDate"]);
    }
  });

export const remediationFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.union([remediationStatusSchema, z.literal("ALL")]).optional(),
  severity: z.union([findingSeveritySchema, z.literal("ALL")]).optional(),
  assignedToUserId: z.string().optional(),
  overdueOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateFindingStatusInput = z.infer<typeof updateFindingStatusSchema>;
export type AssignFindingInput = z.infer<typeof assignFindingSchema>;
export type UpdateFindingTriageInput = z.infer<typeof updateFindingTriageSchema>;
export type CreateRemediationTaskInput = z.infer<
  typeof createRemediationTaskSchema
>;
export type UpdateRemediationTaskInput = z.infer<
  typeof updateRemediationTaskSchema
>;
