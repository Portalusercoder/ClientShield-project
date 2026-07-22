import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { OrganizationSettingsInput } from "@/lib/validations/client-onboarding";
import type { OrganizationSettingsRecord } from "@/types/client-onboarding";

function mapSettings(row: {
  id: string;
  organizationId: string;
  displayName: string | null;
  defaultTimezone: string | null;
  securityContactEmail: string | null;
  defaultReportBranding: unknown;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationSettingsRecord {
  return { ...row };
}

/**
 * Returns organization settings, creating defaults if missing.
 * Never stores secrets — branding is non-credential preferences only.
 */
export async function getOrganizationSettings(
  organizationId: string
): Promise<OrganizationSettingsRecord> {
  const existing = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (existing) return mapSettings(existing);

  const created = await prisma.organizationSettings.create({
    data: {
      organizationId,
      defaultTimezone: "UTC",
    },
  });

  return mapSettings(created);
}

export async function upsertOrganizationSettings(
  organizationId: string,
  input: OrganizationSettingsInput
): Promise<OrganizationSettingsRecord> {
  const branding =
    input.defaultReportBranding === undefined
      ? undefined
      : input.defaultReportBranding === null
        ? Prisma.DbNull
        : (input.defaultReportBranding as Prisma.InputJsonValue);

  const row = await prisma.organizationSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      displayName: input.displayName ?? null,
      defaultTimezone: input.defaultTimezone ?? "UTC",
      securityContactEmail: input.securityContactEmail ?? null,
      defaultReportBranding: branding === undefined ? undefined : branding,
    },
    update: {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName ?? null }
        : {}),
      ...(input.defaultTimezone !== undefined
        ? { defaultTimezone: input.defaultTimezone ?? "UTC" }
        : {}),
      ...(input.securityContactEmail !== undefined
        ? { securityContactEmail: input.securityContactEmail ?? null }
        : {}),
      ...(branding !== undefined
        ? { defaultReportBranding: branding }
        : {}),
    },
  });

  return mapSettings(row);
}
