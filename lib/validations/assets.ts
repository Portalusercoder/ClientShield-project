import { z } from "zod";

export const assetTypeSchema = z.enum([
  "WEBSITE",
  "WEB_APPLICATION",
  "API",
  "SERVER",
  "WORKSTATION",
  "NETWORK_DEVICE",
  "DOMAIN",
  "IOT_DEVICE",
  "OTHER",
]);

export const assetEnvironmentSchema = z.enum([
  "PRODUCTION",
  "STAGING",
  "DEVELOPMENT",
  "OTHER",
]);

export const assetCriticalitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const assetMonitoringStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "INACTIVE",
]);

export const assetAuthorizationStatusSchema = z.enum([
  "AUTHORIZED",
  "PENDING",
  "NOT_AUTHORIZED",
]);

const optionalDescription = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

function normalizeLocation(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Hostname-only values stay as-is; URLs without scheme get https://
  if (
    trimmed.includes("/") ||
    trimmed.includes(".") ||
    trimmed.includes(":")
  ) {
    // If it looks like a domain/URL path without scheme, prefix https for URL-like types later
    return trimmed;
  }
  return trimmed;
}

function isValidUrl(value: string): boolean {
  try {
    const withScheme = /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`;
    const parsed = new URL(withScheme);
    return Boolean(parsed.hostname) && parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function isValidHostname(value: string): boolean {
  // Allow hostname, FQDN, or IPv4-ish values without requiring a URL scheme
  const hostnamePattern =
    /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$|^(\d{1,3}\.){3}\d{1,3}$/;
  return hostnamePattern.test(value.trim());
}

const baseAssetFields = {
  clientId: z.string().cuid("Invalid client ID"),
  name: z.string().trim().min(1, "Asset name is required").max(200),
  type: assetTypeSchema,
  location: z.string().trim().min(1, "URL or hostname is required").max(500),
  environment: assetEnvironmentSchema.default("PRODUCTION"),
  criticality: assetCriticalitySchema.default("MEDIUM"),
  monitoringStatus: assetMonitoringStatusSchema.default("ACTIVE"),
  authorizationStatus: assetAuthorizationStatusSchema.default("PENDING"),
  description: optionalDescription,
};

export const createAssetSchema = z
  .object(baseAssetFields)
  .superRefine((data, ctx) => {
    const location = normalizeLocation(data.location);
    const requiresUrl =
      data.type === "WEBSITE" || data.type === "WEB_APPLICATION";

    if (requiresUrl) {
      if (!isValidUrl(location)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["location"],
          message: "A valid website URL is required for this asset type",
        });
      }
    } else if (!isValidUrl(location) && !isValidHostname(location)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "Enter a valid URL or hostname",
      });
    }
  })
  .transform((data) => {
    const location = normalizeLocation(data.location);
    const requiresUrl =
      data.type === "WEBSITE" ||
      data.type === "WEB_APPLICATION" ||
      data.type === "API";

    if (requiresUrl || isValidUrl(location)) {
      const url = /^https?:\/\//i.test(location)
        ? location
        : `https://${location}`;
      return {
        ...data,
        url,
        hostname: undefined as string | undefined,
      };
    }

    return {
      ...data,
      url: undefined as string | undefined,
      hostname: location,
    };
  });

export const updateAssetSchema = z
  .object({
    clientId: z.string().cuid("Invalid client ID").optional(),
    name: z.string().trim().min(1, "Asset name is required").max(200).optional(),
    type: assetTypeSchema.optional(),
    location: z
      .string()
      .trim()
      .min(1, "URL or hostname is required")
      .max(500)
      .optional(),
    environment: assetEnvironmentSchema.optional(),
    criticality: assetCriticalitySchema.optional(),
    monitoringStatus: assetMonitoringStatusSchema.optional(),
    authorizationStatus: assetAuthorizationStatusSchema.optional(),
    description: optionalDescription,
  })
  .superRefine((data, ctx) => {
    if (!data.location || !data.type) return;

    const location = normalizeLocation(data.location);
    const requiresUrl =
      data.type === "WEBSITE" || data.type === "WEB_APPLICATION";

    if (requiresUrl && !isValidUrl(location)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "A valid website URL is required for this asset type",
      });
    } else if (
      !requiresUrl &&
      !isValidUrl(location) &&
      !isValidHostname(location)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "Enter a valid URL or hostname",
      });
    }
  })
  .transform((data) => {
    if (!data.location) {
      const rest = { ...data };
      delete rest.location;
      return rest;
    }

    const location = normalizeLocation(data.location);
    const type = data.type;
    const requiresUrl =
      type === "WEBSITE" || type === "WEB_APPLICATION" || type === "API";

    const rest = { ...data };
    delete rest.location;

    if (requiresUrl || isValidUrl(location)) {
      const url = /^https?:\/\//i.test(location)
        ? location
        : `https://${location}`;
      return {
        ...rest,
        url,
        hostname: null as string | null,
      };
    }

    return {
      ...rest,
      url: null as string | null,
      hostname: location,
    };
  });

export const assetFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  clientId: z.string().optional(),
  type: z.union([assetTypeSchema, z.literal("ALL")]).optional(),
  criticality: z.union([assetCriticalitySchema, z.literal("ALL")]).optional(),
  monitoringStatus: z
    .union([assetMonitoringStatusSchema, z.literal("ALL")])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const assetIdSchema = z.object({
  id: z.string().cuid("Invalid asset ID"),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type AssetFiltersInput = z.infer<typeof assetFiltersSchema>;
