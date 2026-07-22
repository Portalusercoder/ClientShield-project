import { z } from "zod";

export const reportTypeSchema = z.enum([
  "EXECUTIVE_SUMMARY",
  "SECURITY_POSTURE",
  "TECHNICAL_FINDINGS",
  "REMEDIATION_STATUS",
]);

export const reportStatusSchema = z.enum([
  "DRAFT",
  "GENERATING",
  "READY",
  "FAILED",
  "ARCHIVED",
]);

export const generateReportSchema = z
  .object({
    clientId: z.string().cuid("Invalid client"),
    reportType: reportTypeSchema.default("SECURITY_POSTURE"),
    title: z.string().trim().min(1).max(200),
    reportingPeriodStart: z.string().min(1),
    reportingPeriodEnd: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.reportingPeriodStart);
    const end = new Date(data.reportingPeriodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid reporting period dates",
        path: ["reportingPeriodStart"],
      });
      return;
    }
    if (start.getTime() > end.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be on or before end date",
        path: ["reportingPeriodEnd"],
      });
    }
  });

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
