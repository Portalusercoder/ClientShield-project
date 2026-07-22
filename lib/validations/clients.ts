import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(255)
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

export const clientStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ONBOARDING"]);

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200),
  industry: optionalString,
  primaryContactName: optionalString,
  primaryContactEmail: emailSchema,
  phone: optionalString,
  website: websiteSchema,
  status: clientStatusSchema.default("ONBOARDING"),
});

export const updateClientSchema = createClientSchema.partial().extend({
  name: z.string().trim().min(1, "Client name is required").max(200).optional(),
});

export const clientFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.union([clientStatusSchema, z.literal("ALL")]).optional(),
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
