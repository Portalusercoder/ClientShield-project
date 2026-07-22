import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(255)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const emailRequired = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(255);

const emailOptional = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(255)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const clientContactTypeSchema = z.enum([
  "PRIMARY",
  "TECHNICAL",
  "SECURITY",
  "BILLING",
  "EXECUTIVE",
  "OTHER",
]);

export const clientServiceTypeSchema = z.enum([
  "PASSIVE_WEB_MONITORING",
  "ZAP_BASELINE",
  "WAZUH_ENDPOINT_MONITORING",
  "SECURITY_EVENT_MONITORING",
  "INCIDENT_RESPONSE",
  "REPORTING",
]);

export const clientServiceStatusSchema = z.enum([
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "DISABLED",
]);

export const clientOnboardingStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "READY",
  "COMPLETED",
]);

export const clientOnboardingStepSchema = z.enum([
  "CLIENT_PROFILE",
  "CONTACTS",
  "SECURITY_SCOPE",
  "ASSETS",
  "SERVICES",
  "AUTHORIZATION",
  "REVIEW",
]);

export const clientLifecycleStatusSchema = z.enum([
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "OFFBOARDED",
  "INACTIVE",
]);

export const createClientContactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(200),
  email: emailRequired,
  phone: optionalString,
  jobTitle: optionalString,
  contactType: clientContactTypeSchema.default("OTHER"),
  isPrimary: z.boolean().default(false),
});

export const updateClientContactSchema = createClientContactSchema.partial();

export const setClientServiceSchema = z.object({
  serviceType: clientServiceTypeSchema,
  status: clientServiceStatusSchema,
  configuration: z.record(z.unknown()).optional().nullable(),
});

export const enableClientServiceSchema = z.object({
  serviceType: clientServiceTypeSchema,
  configuration: z.record(z.unknown()).optional().nullable(),
});

export const clientServiceActionSchema = z.object({
  serviceType: clientServiceTypeSchema,
});

export const updateOnboardingStepSchema = z.object({
  step: clientOnboardingStepSchema,
  status: clientOnboardingStatusSchema.optional(),
});

export const transitionClientStatusSchema = z.object({
  toStatus: clientLifecycleStatusSchema,
});

export const organizationSettingsSchema = z.object({
  displayName: optionalString,
  defaultTimezone: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  securityContactEmail: emailOptional,
  defaultReportBranding: z
    .record(z.unknown())
    .optional()
    .nullable()
    .refine(
      (v) => {
        if (!v) return true;
        const forbidden = ["password", "secret", "apiKey", "api_key", "token", "credential"];
        return !Object.keys(v).some((k) =>
          forbidden.some((f) => k.toLowerCase().includes(f))
        );
      },
      { message: "Report branding must not contain secrets" }
    ),
});

export const clientActivityFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateClientContactInput = z.infer<typeof createClientContactSchema>;
export type UpdateClientContactInput = z.infer<typeof updateClientContactSchema>;
export type SetClientServiceInput = z.infer<typeof setClientServiceSchema>;
export type EnableClientServiceInput = z.infer<typeof enableClientServiceSchema>;
export type UpdateOnboardingStepInput = z.infer<typeof updateOnboardingStepSchema>;
export type TransitionClientStatusInput = z.infer<
  typeof transitionClientStatusSchema
>;
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
export type ClientActivityFiltersInput = z.infer<
  typeof clientActivityFiltersSchema
>;
