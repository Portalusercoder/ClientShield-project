import type {
  ClientOnboardingStatus,
  ClientStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ClientDetail,
  ClientFilters,
  ClientListItem,
  ClientListResult,
  ClientManagementMetrics,
} from "@/types/client";
import type { ClientReadinessSummary } from "@/types/client-onboarding";
import type {
  CreateClientInput,
  UpdateClientInput,
} from "@/lib/validations/clients";
import { slugify } from "@/lib/utils";
import { OPEN_INCIDENT_STATUSES } from "@/services/incidents/status-transitions";
import { UNRESOLVED_FINDING_STATUSES } from "@/types/findings";
import { transitionClientStatus } from "@/services/clients/client-lifecycle.service";
import { calculateClientReadiness } from "@/services/clients/client-readiness.service";
import type { DashboardClientAttention } from "@/types/dashboard";

const OPEN_FINDING_STATUSES = UNRESOLVED_FINDING_STATUSES;

const OPEN_INVESTIGATION_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "CONFIRMED",
] as const;

/** Statuses excluded from Active Clients / dashboard total. */
const EXCLUDED_FROM_ACTIVE_COUNT: ClientStatus[] = [
  "OFFBOARDED",
  "INACTIVE",
];

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
  servicesCount: number;
  openInvestigationsCount: number;
}> {
  const [
    assetsCount,
    openFindingsCount,
    openIncidentsCount,
    servicesCount,
    openInvestigationsCount,
  ] = await Promise.all([
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
    prisma.clientService.count({
      where: {
        clientId,
        organizationId,
        status: { in: ["ACTIVE", "PLANNED", "PAUSED"] },
      },
    }),
    prisma.investigationGroup.count({
      where: {
        organizationId,
        clientId,
        status: { in: [...OPEN_INVESTIGATION_STATUSES] },
      },
    }),
  ]);

  return {
    assetsCount,
    openFindingsCount,
    openIncidentsCount,
    servicesCount,
    openInvestigationsCount,
  };
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
    onboarding?: { status: ClientOnboardingStatus } | null;
  },
  counts: {
    assetsCount: number;
    openFindingsCount: number;
    openIncidentsCount: number;
    servicesCount: number;
    openInvestigationsCount: number;
  },
  readinessSummary: ClientReadinessSummary | null
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
    onboardingStatus: client.onboarding?.status ?? null,
    readinessSummary,
    ...counts,
  };
}

function mapToDetail(
  client: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    website: string | null;
    status: ClientStatus;
    securityScore: number | null;
    primaryContactName: string | null;
    primaryContactEmail: string | null;
    phone: string | null;
    country: string | null;
    timezone: string | null;
    notes: string | null;
    onboardingStartedAt: Date | null;
    activatedAt: Date | null;
    suspendedAt: Date | null;
    offboardedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    onboarding?: { status: ClientOnboardingStatus } | null;
  },
  counts: {
    assetsCount: number;
    openFindingsCount: number;
    openIncidentsCount: number;
    servicesCount: number;
    openInvestigationsCount: number;
  },
  readinessSummary: ClientReadinessSummary | null
): ClientDetail {
  return {
    ...mapToListItem(client, counts, readinessSummary),
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    phone: client.phone,
    country: client.country,
    timezone: client.timezone,
    notes: client.notes,
    onboardingStartedAt: client.onboardingStartedAt,
    activatedAt: client.activatedAt,
    suspendedAt: client.suspendedAt,
    offboardedAt: client.offboardedAt,
    updatedAt: client.updatedAt,
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
    ...(filters.onboardingStatus && filters.onboardingStatus !== "ALL"
      ? { onboarding: { status: filters.onboardingStatus } }
      : {}),
    // Approximate readiness via onboarding row (efficient; full calc still returned per row)
    ...(filters.readiness === "READY"
      ? { onboarding: { status: { in: ["READY", "COMPLETED"] } } }
      : filters.readiness === "BLOCKED"
        ? { onboarding: { status: "BLOCKED" } }
        : filters.readiness === "NOT_READY"
          ? {
              OR: [
                { onboarding: null },
                {
                  onboarding: {
                    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
                  },
                },
              ],
            }
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
        onboarding: { select: { status: true } },
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

  const clientsWithMeta = await Promise.all(
    clients.map(async (client) => {
      const [counts, readinessResult] = await Promise.all([
        getClientCounts(client.id, organizationId),
        calculateClientReadiness(organizationId, client.id),
      ]);
      return mapToListItem(
        client,
        counts,
        readinessResult ? { overall: readinessResult.overall } : null
      );
    })
  );

  return {
    clients: clientsWithMeta,
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
    include: { onboarding: { select: { status: true } } },
  });

  if (!client) return null;

  const [counts, readinessResult] = await Promise.all([
    getClientCounts(client.id, organizationId),
    calculateClientReadiness(organizationId, client.id),
  ]);

  return mapToDetail(
    client,
    counts,
    readinessResult ? { overall: readinessResult.overall } : null
  );
}

export async function createClient(
  organizationId: string,
  input: CreateClientInput
): Promise<ClientDetail> {
  const slug = await generateUniqueSlug(organizationId, input.name);
  const now = new Date();

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        organizationId,
        name: input.name,
        slug,
        industry: input.industry,
        country: input.country,
        timezone: input.timezone,
        primaryContactName: input.primaryContactName,
        primaryContactEmail: input.primaryContactEmail,
        phone: input.phone,
        website: input.website,
        notes: input.notes,
        status: "ONBOARDING",
        onboardingStartedAt: now,
      },
    });

    await tx.clientOnboarding.create({
      data: {
        organizationId,
        clientId: created.id,
        status: "IN_PROGRESS",
        currentStep: "CLIENT_PROFILE",
        startedAt: now,
      },
    });

    return created;
  });

  return mapToDetail(
    { ...client, onboarding: { status: "IN_PROGRESS" } },
    {
      assetsCount: 0,
      openFindingsCount: 0,
      openIncidentsCount: 0,
      servicesCount: 0,
      openInvestigationsCount: 0,
    },
    { overall: "NOT_READY" }
  );
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

  if (input.status !== undefined && input.status !== existing.status) {
    const transitioned = await transitionClientStatus(
      organizationId,
      clientId,
      input.status
    );
    if (!transitioned) return null;
  }

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
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.primaryContactName !== undefined
        ? { primaryContactName: input.primaryContactName }
        : {}),
      ...(input.primaryContactEmail !== undefined
        ? { primaryContactEmail: input.primaryContactEmail }
        : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: { onboarding: { select: { status: true } } },
  });

  const [counts, readinessResult] = await Promise.all([
    getClientCounts(client.id, organizationId),
    calculateClientReadiness(organizationId, client.id),
  ]);

  return mapToDetail(
    client,
    counts,
    readinessResult ? { overall: readinessResult.overall } : null
  );
}

/**
 * Soft-archives a client by transitioning to OFFBOARDED via lifecycle.
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

  const transitioned = await transitionClientStatus(
    organizationId,
    clientId,
    "OFFBOARDED"
  );
  if (!transitioned) return null;

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    include: { onboarding: { select: { status: true } } },
  });
  if (!client) return null;

  const [counts, readinessResult] = await Promise.all([
    getClientCounts(client.id, organizationId),
    calculateClientReadiness(organizationId, client.id),
  ]);

  return mapToDetail(
    client,
    counts,
    readinessResult ? { overall: readinessResult.overall } : null
  );
}

/**
 * Dashboard / Active Clients metric.
 * Excludes OFFBOARDED and deprecated INACTIVE. Includes ACTIVE and other live statuses.
 */
export async function countClients(organizationId: string): Promise<number> {
  return prisma.client.count({
    where: {
      organizationId,
      status: { notIn: EXCLUDED_FROM_ACTIVE_COUNT },
    },
  });
}

/**
 * Client management metrics for the dashboard overview.
 */
export async function getClientManagementMetrics(
  organizationId: string
): Promise<ClientManagementMetrics> {
  const liveWhere: Prisma.ClientWhereInput = {
    organizationId,
    status: { notIn: EXCLUDED_FROM_ACTIVE_COUNT },
  };

  const [
    activeClients,
    clientsOnboarding,
    liveClients,
    clientsWithCriticalFindings,
    clientsWithOpenIncidents,
  ] = await Promise.all([
    prisma.client.count({
      where: { organizationId, status: "ACTIVE" },
    }),
    prisma.client.count({
      where: { organizationId, status: "ONBOARDING" },
    }),
    prisma.client.findMany({
      where: liveWhere,
      select: { id: true },
    }),
    prisma.client.count({
      where: {
        organizationId,
        status: { notIn: EXCLUDED_FROM_ACTIVE_COUNT },
        assets: {
          some: {
            findings: {
              some: {
                organizationId,
                severity: "CRITICAL",
                status: { in: [...OPEN_FINDING_STATUSES] },
              },
            },
          },
        },
      },
    }),
    prisma.client.count({
      where: {
        organizationId,
        status: { notIn: EXCLUDED_FROM_ACTIVE_COUNT },
        incidents: {
          some: {
            organizationId,
            status: { in: [...OPEN_INCIDENT_STATUSES] },
          },
        },
      },
    }),
  ]);

  let clientsNotReady = 0;
  await Promise.all(
    liveClients.map(async (c) => {
      const readiness = await calculateClientReadiness(organizationId, c.id);
      if (
        readiness &&
        (readiness.overall === "NOT_READY" || readiness.overall === "BLOCKED")
      ) {
        clientsNotReady += 1;
      }
    })
  );

  return {
    activeClients,
    clientsOnboarding,
    clientsNotReady,
    clientsWithCriticalFindings,
    clientsWithOpenIncidents,
  };
}

/**
 * Live clients needing attention: not ready, critical findings, or open incidents.
 */
export async function getClientsRequiringAttention(
  organizationId: string,
  limit = 8
): Promise<DashboardClientAttention[]> {
  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      status: { notIn: EXCLUDED_FROM_ACTIVE_COUNT },
    },
    select: {
      id: true,
      name: true,
      securityScore: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const scored = await Promise.all(
    clients.map(async (client) => {
      const [readiness, criticalFindings, openIncidents] = await Promise.all([
        calculateClientReadiness(organizationId, client.id),
        prisma.finding.count({
          where: {
            organizationId,
            severity: "CRITICAL",
            status: { in: [...OPEN_FINDING_STATUSES] },
            asset: { clientId: client.id },
          },
        }),
        prisma.incident.count({
          where: {
            organizationId,
            clientId: client.id,
            status: { in: [...OPEN_INCIDENT_STATUSES] },
          },
        }),
      ]);

      const notReady =
        readiness?.overall === "NOT_READY" ||
        readiness?.overall === "BLOCKED";

      return {
        id: client.id,
        name: client.name,
        securityScore: client.securityScore ?? 0,
        criticalFindings,
        openIncidents,
        attention:
          notReady || criticalFindings > 0 || openIncidents > 0,
      };
    })
  );

  return scored
    .filter((c) => c.attention)
    .sort(
      (a, b) =>
        b.criticalFindings + b.openIncidents -
        (a.criticalFindings + a.openIncidents)
    )
    .slice(0, limit)
    .map(({ id, name, securityScore, criticalFindings, openIncidents }) => ({
      id,
      name,
      securityScore,
      criticalFindings,
      openIncidents,
    }));
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
