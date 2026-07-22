import { Prisma, type ClientServiceStatus, type ClientServiceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EnableClientServiceInput } from "@/lib/validations/client-onboarding";
import type { ClientServiceRecord } from "@/types/client-onboarding";
import { SERVICE_CATALOG } from "@/types/client-onboarding";

async function assertClientInOrganization(
  organizationId: string,
  clientId: string
): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  return client !== null;
}

function mapService(row: {
  id: string;
  organizationId: string;
  clientId: string;
  serviceType: ClientServiceType;
  status: ClientServiceStatus;
  enabledAt: Date | null;
  disabledAt: Date | null;
  configuration: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ClientServiceRecord {
  return { ...row };
}

function assertCatalogType(serviceType: ClientServiceType): void {
  if (!SERVICE_CATALOG.includes(serviceType)) {
    throw new Error(`Unknown service type: ${serviceType}`);
  }
}

/**
 * Lists enabled/configured services for a client (catalog rows that exist).
 */
export async function listClientServices(
  organizationId: string,
  clientId: string
): Promise<ClientServiceRecord[]> {
  const ok = await assertClientInOrganization(organizationId, clientId);
  if (!ok) return [];

  const rows = await prisma.clientService.findMany({
    where: { organizationId, clientId },
    orderBy: { serviceType: "asc" },
  });

  return rows.map(mapService);
}

export async function getClientService(
  organizationId: string,
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientServiceRecord | null> {
  const row = await prisma.clientService.findFirst({
    where: { organizationId, clientId, serviceType },
  });
  return row ? mapService(row) : null;
}

async function upsertServiceStatus(
  organizationId: string,
  clientId: string,
  serviceType: ClientServiceType,
  status: ClientServiceStatus,
  configuration?: Record<string, unknown> | null
): Promise<ClientServiceRecord | null> {
  assertCatalogType(serviceType);

  const ok = await assertClientInOrganization(organizationId, clientId);
  if (!ok) return null;

  const now = new Date();
  const configValue =
    configuration === undefined
      ? undefined
      : configuration === null
        ? Prisma.DbNull
        : (configuration as Prisma.InputJsonValue);

  const existing = await prisma.clientService.findFirst({
    where: { organizationId, clientId, serviceType },
  });

  if (!existing) {
    const created = await prisma.clientService.create({
      data: {
        organizationId,
        clientId,
        serviceType,
        status,
        enabledAt: status === "ACTIVE" ? now : null,
        disabledAt: status === "DISABLED" ? now : null,
        ...(configValue !== undefined
          ? { configuration: configValue }
          : {}),
      },
    });
    return mapService(created);
  }

  const updated = await prisma.clientService.update({
    where: { id: existing.id },
    data: {
      status,
      ...(status === "ACTIVE"
        ? { enabledAt: existing.enabledAt ?? now, disabledAt: null }
        : {}),
      ...(status === "DISABLED" ? { disabledAt: now } : {}),
      ...(status === "PAUSED" || status === "PLANNED"
        ? { disabledAt: null }
        : {}),
      ...(configValue !== undefined ? { configuration: configValue } : {}),
    },
  });

  return mapService(updated);
}

/** Enable a catalog service (ACTIVE). Enabling ≠ technical readiness. */
export async function enableClientService(
  organizationId: string,
  clientId: string,
  input: EnableClientServiceInput
): Promise<ClientServiceRecord | null> {
  return upsertServiceStatus(
    organizationId,
    clientId,
    input.serviceType,
    "ACTIVE",
    input.configuration
  );
}

export async function pauseClientService(
  organizationId: string,
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientServiceRecord | null> {
  return upsertServiceStatus(organizationId, clientId, serviceType, "PAUSED");
}

export async function disableClientService(
  organizationId: string,
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientServiceRecord | null> {
  return upsertServiceStatus(
    organizationId,
    clientId,
    serviceType,
    "DISABLED"
  );
}

export async function setClientServiceStatus(
  organizationId: string,
  clientId: string,
  serviceType: ClientServiceType,
  status: ClientServiceStatus,
  configuration?: Record<string, unknown> | null
): Promise<ClientServiceRecord | null> {
  return upsertServiceStatus(
    organizationId,
    clientId,
    serviceType,
    status,
    configuration
  );
}

export function listServiceCatalog(): ClientServiceType[] {
  return [...SERVICE_CATALOG];
}
