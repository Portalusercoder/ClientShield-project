import type {
  AssetAuthorizationStatus,
  AssetCriticality,
  AssetEnvironment,
  AssetMonitoringStatus,
  AssetType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  CreateAssetInput,
  UpdateAssetInput,
} from "@/lib/validations/assets";
import type {
  AssetDetail,
  AssetFilters,
  AssetListItem,
  AssetListResult,
} from "@/types/asset";

function toLocation(url: string | null, hostname: string | null): string {
  return url ?? hostname ?? "—";
}

function mapAsset(
  asset: {
    id: string;
    name: string;
    type: AssetType;
    url: string | null;
    hostname: string | null;
    environment: AssetEnvironment;
    criticality: AssetCriticality;
    monitoringStatus: AssetMonitoringStatus;
    authorizationStatus: AssetAuthorizationStatus;
    securityScore: number | null;
    lastSecurityCheckAt: Date | null;
    clientId: string;
    createdAt: Date;
    client: { name: string };
  }
): AssetListItem {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    url: asset.url,
    hostname: asset.hostname,
    location: toLocation(asset.url, asset.hostname),
    environment: asset.environment,
    criticality: asset.criticality,
    monitoringStatus: asset.monitoringStatus,
    authorizationStatus: asset.authorizationStatus,
    securityScore: asset.securityScore,
    lastSecurityCheckAt: asset.lastSecurityCheckAt,
    clientId: asset.clientId,
    clientName: asset.client.name,
    createdAt: asset.createdAt,
  };
}

/**
 * Verifies the client belongs to the authenticated organization.
 * Never trust clientId ownership from browser input alone.
 */
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

/**
 * Lists assets scoped to the authenticated organization.
 */
export async function listAssets(
  organizationId: string,
  filters: AssetFilters = {}
): Promise<AssetListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AssetWhereInput = {
    organizationId,
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { url: { contains: filters.search, mode: "insensitive" } },
            { hostname: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.clientId && filters.clientId !== "ALL"
      ? { clientId: filters.clientId }
      : {}),
    ...(filters.type && filters.type !== "ALL" ? { type: filters.type } : {}),
    ...(filters.criticality && filters.criticality !== "ALL"
      ? { criticality: filters.criticality }
      : {}),
    ...(filters.monitoringStatus && filters.monitoringStatus !== "ALL"
      ? { monitoringStatus: filters.monitoringStatus }
      : {}),
  };

  const [assets, total, clients] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        client: { select: { name: true } },
      },
    }),
    prisma.asset.count({ where }),
    prisma.client.findMany({
      where: { organizationId, status: { not: "INACTIVE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    assets: assets.map(mapAsset),
    total,
    page,
    pageSize,
    clients,
  };
}

export async function listAssetsForClient(
  organizationId: string,
  clientId: string
): Promise<AssetListItem[]> {
  const belongs = await assertClientInOrganization(organizationId, clientId);
  if (!belongs) return [];

  const assets = await prisma.asset.findMany({
    where: { organizationId, clientId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  return assets.map(mapAsset);
}

export async function getAssetById(
  organizationId: string,
  assetId: string
): Promise<AssetDetail | null> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    include: { client: { select: { name: true } } },
  });

  if (!asset) return null;

  return {
    ...mapAsset(asset),
    description: asset.description,
    organizationId: asset.organizationId,
    updatedAt: asset.updatedAt,
  };
}

export async function createAsset(
  organizationId: string,
  input: CreateAssetInput
): Promise<AssetDetail> {
  const belongs = await assertClientInOrganization(
    organizationId,
    input.clientId
  );
  if (!belongs) {
    throw new Error("Client not found in organization");
  }

  const asset = await prisma.asset.create({
    data: {
      organizationId,
      clientId: input.clientId,
      name: input.name,
      type: input.type,
      url: input.url,
      hostname: input.hostname,
      environment: input.environment,
      criticality: input.criticality,
      monitoringStatus: input.monitoringStatus,
      authorizationStatus: input.authorizationStatus,
      description: input.description,
    },
    include: { client: { select: { name: true } } },
  });

  return {
    ...mapAsset(asset),
    description: asset.description,
    organizationId: asset.organizationId,
    updatedAt: asset.updatedAt,
  };
}

export async function updateAsset(
  organizationId: string,
  assetId: string,
  input: UpdateAssetInput
): Promise<AssetDetail | null> {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
  });

  if (!existing) return null;

  if (input.clientId && input.clientId !== existing.clientId) {
    const belongs = await assertClientInOrganization(
      organizationId,
      input.clientId
    );
    if (!belongs) {
      throw new Error("Client not found in organization");
    }
  }

  const asset = await prisma.asset.update({
    where: { id: assetId },
    data: {
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...("url" in input ? { url: input.url } : {}),
      ...("hostname" in input ? { hostname: input.hostname } : {}),
      ...(input.environment !== undefined
        ? { environment: input.environment }
        : {}),
      ...(input.criticality !== undefined
        ? { criticality: input.criticality }
        : {}),
      ...(input.monitoringStatus !== undefined
        ? { monitoringStatus: input.monitoringStatus }
        : {}),
      ...(input.authorizationStatus !== undefined
        ? { authorizationStatus: input.authorizationStatus }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
    },
    include: { client: { select: { name: true } } },
  });

  return {
    ...mapAsset(asset),
    description: asset.description,
    organizationId: asset.organizationId,
    updatedAt: asset.updatedAt,
  };
}

/**
 * Soft-archives an asset by setting monitoringStatus to INACTIVE.
 * Does not cascade-delete findings, scans, or incidents.
 */
export async function archiveAsset(
  organizationId: string,
  assetId: string
): Promise<AssetDetail | null> {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
  });

  if (!existing) return null;

  const asset = await prisma.asset.update({
    where: { id: assetId },
    data: { monitoringStatus: "INACTIVE" },
    include: { client: { select: { name: true } } },
  });

  return {
    ...mapAsset(asset),
    description: asset.description,
    organizationId: asset.organizationId,
    updatedAt: asset.updatedAt,
  };
}

export async function countMonitoredAssets(
  organizationId: string
): Promise<number> {
  return prisma.asset.count({
    where: {
      organizationId,
      monitoringStatus: "ACTIVE",
    },
  });
}

export async function listClientOptions(
  organizationId: string
): Promise<{ id: string; name: string }[]> {
  return prisma.client.findMany({
    where: { organizationId, status: { not: "INACTIVE" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Verifies organization isolation for assets.
 */
export async function verifyAssetOrganizationAccess(
  organizationId: string,
  assetId: string
): Promise<boolean> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true },
  });
  return asset !== null;
}
