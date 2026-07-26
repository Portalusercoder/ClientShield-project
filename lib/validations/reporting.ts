import { z } from "zod";

export const frameworkReportKindSchema = z.enum([
  "EXECUTIVE_SUMMARY",
  "INCIDENT",
  "INVESTIGATION",
  "FINDINGS",
  "ASSET_SECURITY",
  "CLIENT_SECURITY",
  "SLA",
]);

export const reportFiltersSchema = z.object({
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  findingStatus: z.string().optional().nullable(),
  incidentId: z.string().optional().nullable(),
  investigationId: z.string().optional().nullable(),
});

export const frameworkReportRequestSchema = z.object({
  kind: frameworkReportKindSchema,
  filters: reportFiltersSchema.optional().default({}),
});

export type FrameworkReportRequest = z.infer<
  typeof frameworkReportRequestSchema
>;
