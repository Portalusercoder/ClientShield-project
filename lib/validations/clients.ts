import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(255)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalNotes = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

function normalizeWebsite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const websiteSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => normalizeWebsite(v === "" ? undefined : v))
  .refine((v) => v === undefined || z.string().url().safeParse(v).success, {
    message: "Invalid website URL",
  });

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(255)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const clientStatusSchema = z.enum([
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "OFFBOARDED",
  "INACTIVE",
]);

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200),
  industry: optionalString,
  country: optionalString,
  timezone: optionalString,
  primaryContactName: optionalString,
  primaryContactEmail: emailSchema,
  phone: optionalString,
  website: websiteSchema,
  notes: optionalNotes,
  /** New clients always start in ONBOARDING — status on create is ignored. */
  status: clientStatusSchema.optional(),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200).optional(),
  industry: optionalString,
  country: optionalString,
  timezone: optionalString,
  primaryContactName: optionalString,
  primaryContactEmail: emailSchema,
  phone: optionalString,
  website: websiteSchema,
  notes: optionalNotes,
  status: clientStatusSchema.optional(),
});

export const clientFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.union([clientStatusSchema, z.literal("ALL")]).optional(),
  onboardingStatus: z
    .union([
      z.enum([
        "NOT_STARTED",
        "IN_PROGRESS",
        "BLOCKED",
        "READY",
        "COMPLETED",
      ]),
      z.literal("ALL"),
    ])
    .optional(),
  readiness: z
    .union([
      z.enum(["READY", "NOT_READY", "BLOCKED"]),
      z.literal("ALL"),
    ])
    .optional(),
  industry: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const clientIdSchema = z.object({
  id: z.string().cuid("Invalid client ID"),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientFiltersInput = z.infer<typeof clientFiltersSchema>;
