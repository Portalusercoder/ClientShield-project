import type { ClientStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ClientDetail,
  ClientFilters,
  ClientListItem,
  ClientListResult,
} from "@/types/client";
import type {
  CreateClientInput,
  UpdateClientInput,
} from "@/lib/validations/clients";
import { slugify } from "@/lib/utils";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";

const OPEN_FINDING_STATUSES = UNRESOLVED_FINDING_STATUSES;

async function generateUniqueSlug(
  organizationId: string,
  name: string,
  excludeClientId?: string
): Promise<string> {
  const base = slugify(name) || "client";
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.client.findFirst({
      where: {
        organizationId,
        slug,
        ...(excludeClientId ? { NOT: { id: excludeClientId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}

async function getClientCounts(
  clientId: string,
  organizationId: string
): Promise<{
  assetsCount: number;
  openFindingsCount: number;
  openIncidentsCount: number;
}> {
  const [assetsCount, openFindingsCount, openIncidentsCount] =
    await Promise.all([
      prisma.asset.count({
        where: { clientId, organizationId },
      }),
      prisma.finding.count({
        where: {
          organizationId,
          status: { in: [...OPEN_FINDING_STATUSES] },
          asset: { clientId },
        },
      }),
      prisma.incident.count({
        where: {
          clientId,
          organizationId,
          status: { in: [...OPEN_INCIDENT_STATUSES] },
        },
      }),
    ]);

  return { assetsCount, openFindingsCount, openIncidentsCount };
}

function mapToListItem(
  client: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    website: string | null;
    status: ClientStatus;
    securityScore: number | null;
    createdAt: Date;
  },
  counts: {
    assetsCount: number;
    openFindingsCount: number;
    openIncidentsCount: number;
  }
): ClientListItem {
  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    industry: client.industry,
    website: client.website,
    status: client.status,
    securityScore: client.securityScore,
    createdAt: client.createdAt,
    ...counts,
  };
}

/**
 * Lists clients scoped to the authenticated organization.
 * organizationId must come from the server session — never from client input.
 */
export async function listClients(
  organizationId: string,
  filters: ClientFilters = {}
): Promise<ClientListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ClientWhereInput = {
    organizationId,
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" } }
      : {}),
    ...(filters.status && filters.status !== "ALL"
      ? { status: filters.status }
      : {}),
    ...(filters.industry && filters.industry !== "ALL"
      ? { industry: filters.industry }
      : {}),
  };

  const [clients, total, industryRows] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        website: true,
        status: true,
        securityScore: true,
        createdAt: true,
      },
    }),
    prisma.client.count({ where }),
    prisma.client.findMany({
      where: { organizationId, industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
    }),
  ]);

  const clientsWithCounts = await Promise.all(
    clients.map(async (client) => {
      const counts = await getClientCounts(client.id, organizationId);
      return mapToListItem(client, counts);
    })
  );

  return {
    clients: clientsWithCounts,
    total,
    page,
    pageSize,
    industries: industryRows
      .map((r) => r.industry)
      .filter((i): i is string => i !== null),
  };
}

/**
 * Retrieves a single client by ID, scoped to organization.
 * Returns null if not found or belongs to another organization.
 */
export async function getClientById(
  organizationId: string,
  clientId: string
): Promise<ClientDetail | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
  });

  if (!client) return null;

  const counts = await getClientCounts(client.id, organizationId);

  return {
    ...mapToListItem(client, counts),
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    phone: client.phone,
    updatedAt: client.updatedAt,
  };
}

export async function createClient(
  organizationId: string,
  input: CreateClientInput
): Promise<ClientDetail> {
  const slug = await generateUniqueSlug(organizationId, input.name);

  const client = await prisma.client.create({
    data: {
      organizationId,
      name: input.name,
      slug,
      industry: input.industry,
      primaryContactName: input.primaryContactName,
      primaryContactEmail: input.primaryContactEmail,
      phone: input.phone,
      website: input.website,
      status: input.status,
    },
  });

  return {
    ...mapToListItem(client, {
      assetsCount: 0,
      openFindingsCount: 0,
      openIncidentsCount: 0,
    }),
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    phone: client.phone,
    updatedAt: client.updatedAt,
  };
}

export async function updateClient(
  organizationId: string,
  clientId: string,
  input: UpdateClientInput
): Promise<ClientDetail | null> {
  const existing = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
  });

  if (!existing) return null;

  const slug =
    input.name && input.name !== existing.name
      ? await generateUniqueSlug(organizationId, input.name, clientId)
      : existing.slug;

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      slug,
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.primaryContactName !== undefined
        ? { primaryContactName: input.primaryContactName }
        : {}),
      ...(input.primaryContactEmail !== undefined
        ? { primaryContactEmail: input.primaryContactEmail }
        : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  const counts = await getClientCounts(client.id, organizationId);

  return {
    ...mapToListItem(client, counts),
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    phone: client.phone,
    updatedAt: client.updatedAt,
  };
}

/**
 * Soft-archives a client by setting status to INACTIVE.
 * Does not cascade-delete security data.
 */
export async function archiveClient(
  organizationId: string,
  clientId: string
): Promise<ClientDetail | null> {
  const existing = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
  });

  if (!existing) return null;

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { status: "INACTIVE" },
  });

  const counts = await getClientCounts(client.id, organizationId);

  return {
    ...mapToListItem(client, counts),
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    phone: client.phone,
    updatedAt: client.updatedAt,
  };
}

export async function countClients(organizationId: string): Promise<number> {
  return prisma.client.count({
    where: { organizationId, status: { not: "INACTIVE" } },
  });
}

/**
 * Verifies organization isolation — used in development testing.
 * A client from org A must not be accessible from org B.
 */
export async function verifyClientOrganizationAccess(
  organizationId: string,
  clientId: string
): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  return client !== null;
}
