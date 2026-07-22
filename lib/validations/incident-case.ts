import { z } from "zod";

export const playbookPhaseSchema = z.enum([
  "INVESTIGATION",
  "CONTAINMENT",
  "ERADICATION",
  "RECOVERY",
  "POST_INCIDENT",
]);

export const responseTaskStatusSchema = z.enum([
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
]);

export const responseTaskPrioritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

export const evidenceTypeSchema = z.enum([
  "SECURITY_EVENT",
  "FINDING",
  "LOG",
  "SCREENSHOT",
  "DOCUMENT",
  "FILE",
  "NOTE",
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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
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

export const assignPlaybookSchema = z.object({
  playbookId: z.string().trim().min(1, "Playbook is required"),
});

export const createResponseTaskSchema = z.object({
  phase: playbookPhaseSchema,
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText(5000),
  priority: responseTaskPrioritySchema.optional().default("MEDIUM"),
  isRequired: z.coerce.boolean().optional().default(true),
  assignedToUserId: optionalId,
  dueAt: optionalDate,
});

export const updateResponseTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: optionalText(5000),
    priority: responseTaskPrioritySchema.optional(),
    phase: playbookPhaseSchema.optional(),
    isRequired: z.boolean().optional(),
    dueAt: optionalDate,
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== null && v !== undefined),
    { message: "At least one field is required" }
  );

export const setResponseTaskStatusSchema = z
  .object({
    status: responseTaskStatusSchema,
    blockedReason: optionalText(2000),
    skipReason: optionalText(2000),
    completionNote: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.status === "BLOCKED" && !data.blockedReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "blockedReason is required when status is BLOCKED",
        path: ["blockedReason"],
      });
    }
    if (data.status === "SKIPPED" && !data.skipReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skipReason is required when status is SKIPPED",
        path: ["skipReason"],
      });
    }
  });

/** @deprecated Prefer setResponseTaskStatusSchema */
export const updateResponseTaskStatusSchema = setResponseTaskStatusSchema;

export const assignResponseTaskSchema = z.object({
  assignedToUserId: optionalId,
});

export const addNoteEvidenceSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText(5000),
  url: z
    .string()
    .trim()
    .url("Invalid URL")
    .max(2000)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? null : v)),
});

/** Alias used by some call sites */
export const addEvidenceNoteSchema = addNoteEvidenceSchema;

export const linkSecurityEventEvidenceSchema = z.object({
  securityEventId: z.string().trim().min(1, "Security event is required"),
  title: z.string().trim().min(1).max(300).optional(),
  description: optionalText(5000),
});

export const linkEvidenceSecurityEventSchema = linkSecurityEventEvidenceSchema;

export const linkFindingEvidenceSchema = z.object({
  findingId: z.string().trim().min(1, "Finding is required"),
  title: z.string().trim().min(1).max(300).optional(),
  description: optionalText(5000),
});

export const linkEvidenceFindingSchema = linkFindingEvidenceSchema;

export const setLeadAnalystSchema = z.object({
  leadAnalystUserId: optionalId,
});

export const setCommanderSchema = z.object({
  commanderUserId: optionalId,
});

export const closeIncidentCaseSchema = z.object({
  closingNote: z
    .string()
    .trim()
    .min(1, "Closing note is required")
    .max(5000),
});

export const closeIncidentSchema = closeIncidentCaseSchema;

export const reopenIncidentSchema = z.object({
  reason: z.string().trim().min(1, "Reopen reason is required").max(2000),
});

export const updatePostIncidentSchema = z
  .object({
    rootCause: optionalText(5000),
    impactSummary: optionalText(5000),
    scopeSummary: optionalText(5000),
    lessonsLearned: optionalText(5000),
    whatWentWell: optionalText(5000),
    whatCouldImprove: optionalText(5000),
    followUpActions: optionalText(5000),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== null && v !== undefined),
    { message: "At least one post-incident field is required" }
  );

export type AssignPlaybookInput = z.infer<typeof assignPlaybookSchema>;
export type CreateResponseTaskInput = z.infer<typeof createResponseTaskSchema>;
export type UpdateResponseTaskInput = z.infer<typeof updateResponseTaskSchema>;
export type AssignResponseTaskInput = z.infer<typeof assignResponseTaskSchema>;
export type SetResponseTaskStatusInput = z.infer<
  typeof setResponseTaskStatusSchema
>;
export type UpdateResponseTaskStatusInput = SetResponseTaskStatusInput;
export type AddNoteEvidenceInput = z.infer<typeof addNoteEvidenceSchema>;
export type LinkSecurityEventEvidenceInput = z.infer<
  typeof linkSecurityEventEvidenceSchema
>;
export type LinkFindingEvidenceInput = z.infer<
  typeof linkFindingEvidenceSchema
>;
export type SetLeadAnalystInput = z.infer<typeof setLeadAnalystSchema>;
export type SetCommanderInput = z.infer<typeof setCommanderSchema>;
export type CloseIncidentCaseInput = z.infer<typeof closeIncidentCaseSchema>;
export type CloseIncidentInput = CloseIncidentCaseInput;
export type ReopenIncidentInput = z.infer<typeof reopenIncidentSchema>;
export type UpdatePostIncidentInput = z.infer<typeof updatePostIncidentSchema>;
