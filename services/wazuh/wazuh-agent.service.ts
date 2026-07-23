import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { isWazuhMappableAssetType } from "@/lib/wazuh/constants";
import { createAuditLog } from "@/services/audit.service";
import { listWazuhAgents } from "@/services/wazuh/wazuh-manager-client.service";
import type { WazuhAgentListItem } from "@/types/security-events";

export async function listWazuhAgentsWithMappings(
  organizationId: string
): Promise<WazuhAgentListItem[]> {
  if (
    !serverEnv.WAZUH_ENABLED ||
    serverEnv.WAZUH_ORGANIZATION_ID !== organizationId
  ) {
    return [];
  }

  const [agents, mappings] = await Promise.all([
    listWazuhAgents(),
    prisma.wazuhAgentMapping.findMany({
      where: { organizationId },
      include: {
        client: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
      },
    }),
  ]);

  const mappingByAgent = new Map(
    mappings.map((m) => [m.wazuhAgentId, m] as const)
  );

  const enrollments = await prisma.wazuhAgentEnrollment.findMany({
    where: {
      organizationId,
      wazuhAgentId: { not: null },
      status: { in: ["READY", "ENROLLING", "ENROLLED", "VERIFIED"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const enrollmentByAgent = new Map<string, (typeof enrollments)[number]>();
  for (const e of enrollments) {
    if (e.wazuhAgentId && !enrollmentByAgent.has(e.wazuhAgentId)) {
      enrollmentByAgent.set(e.wazuhAgentId, e);
    }
  }

  return agents.map((a) => {
    const mapping = mappingByAgent.get(a.id);
    const enrollment = enrollmentByAgent.get(a.id);
    const isManager = a.id === "000";
    let inventoryRole:
      | "MANAGER"
      | "MAPPED_ENDPOINT"
      | "UNMAPPED_ENDPOINT"
      | "DISCONNECTED_ENDPOINT" = "UNMAPPED_ENDPOINT";
    if (isManager) inventoryRole = "MANAGER";
    else if (mapping?.status === "ACTIVE" && mapping.assetId) {
      inventoryRole =
        a.status?.toLowerCase() === "active"
          ? "MAPPED_ENDPOINT"
          : "DISCONNECTED_ENDPOINT";
    }

    return {
      id: a.id,
      name: a.name,
      status: a.status,
      ip: a.ip,
      os: a.os,
      version: a.version,
      lastKeepAlive: a.lastKeepAlive,
      mappedClientId: mapping?.status === "ACTIVE" ? mapping.clientId ?? null : null,
      mappedClientName:
        mapping?.status === "ACTIVE" ? mapping.client?.name ?? null : null,
      mappedAssetId: mapping?.status === "ACTIVE" ? mapping.assetId ?? null : null,
      mappedAssetName:
        mapping?.status === "ACTIVE" ? mapping.asset?.name ?? null : null,
      mappingId: mapping?.status === "ACTIVE" ? mapping.id : null,
      mappingStatus: mapping?.status ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      inventoryRole,
      mappable: !isManager,
    };
  });
}

export async function upsertWazuhAgentMapping(input: {
  organizationId: string;
  actorId: string;
  wazuhAgentId: string;
  wazuhAgentName?: string;
  clientId: string;
  assetId: string;
}): Promise<void> {
  if (input.wazuhAgentId === "000") {
    throw new Error(
      "Built-in manager agent 000 cannot be mapped to a ClientShield asset"
    );
  }

  if (serverEnv.WAZUH_ORGANIZATION_ID !== input.organizationId) {
    throw new Error("Wazuh mapping is not configured for this organization");
  }

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId: input.organizationId },
  });
  if (!client) throw new Error("Client not found");

  const asset = await prisma.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      clientId: input.clientId,
    },
  });
  if (!asset) throw new Error("Asset not found for client");

  if (!isWazuhMappableAssetType(asset.type)) {
    throw new Error(
      `Asset type ${asset.type} cannot be mapped to a Wazuh endpoint agent. Use SERVER, WORKSTATION, NETWORK_DEVICE, IOT_DEVICE, or OTHER.`
    );
  }

  const existingAgent = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      wazuhAgentId: input.wazuhAgentId,
      status: "ACTIVE",
    },
  });
  if (
    existingAgent &&
    (existingAgent.clientId !== input.clientId ||
      existingAgent.assetId !== input.assetId)
  ) {
    throw new Error(
      "Agent is already actively mapped to another client/asset. Use enrollment remap with explicit confirmation."
    );
  }

  const existingAsset = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: input.assetId,
      status: "ACTIVE",
      NOT: { wazuhAgentId: input.wazuhAgentId },
    },
  });
  if (existingAsset) {
    throw new Error(
      "Asset already has a different active Wazuh agent mapping"
    );
  }

  await prisma.wazuhAgentMapping.upsert({
    where: {
      organizationId_wazuhAgentId: {
        organizationId: input.organizationId,
        wazuhAgentId: input.wazuhAgentId,
      },
    },
    create: {
      organizationId: input.organizationId,
      wazuhAgentId: input.wazuhAgentId,
      wazuhAgentName: input.wazuhAgentName,
      clientId: input.clientId,
      assetId: input.assetId,
      mappedByUserId: input.actorId,
      status: "ACTIVE",
    },
    update: {
      wazuhAgentName: input.wazuhAgentName,
      clientId: input.clientId,
      assetId: input.assetId,
      mappedByUserId: input.actorId,
      status: "ACTIVE",
      inactiveAt: null,
      inactiveReason: null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_AGENT_MAPPED",
    resourceType: "WazuhAgentMapping",
    resourceId: input.wazuhAgentId,
    metadata: {
      clientId: input.clientId,
      assetId: input.assetId,
    },
  });
}

export async function removeWazuhAgentMapping(input: {
  organizationId: string;
  actorId: string;
  wazuhAgentId: string;
}): Promise<void> {
  const mapping = await prisma.wazuhAgentMapping.findUnique({
    where: {
      organizationId_wazuhAgentId: {
        organizationId: input.organizationId,
        wazuhAgentId: input.wazuhAgentId,
      },
    },
  });
  if (!mapping) throw new Error("Mapping not found");

  await prisma.wazuhAgentMapping.delete({ where: { id: mapping.id } });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_AGENT_UNMAPPED",
    resourceType: "WazuhAgentMapping",
    resourceId: input.wazuhAgentId,
  });
}

export async function suggestAssetMappingsForAgent(input: {
  organizationId: string;
  agentName: string;
  agentIp: string | null;
}): Promise<
  { assetId: string; assetName: string; clientId: string; clientName: string; reason: string }[]
> {
  const assets = await prisma.asset.findMany({
    where: { organizationId: input.organizationId },
    include: { client: { select: { id: true, name: true } } },
    take: 200,
  });

  const suggestions: {
    assetId: string;
    assetName: string;
    clientId: string;
    clientName: string;
    reason: string;
  }[] = [];

  const nameLower = input.agentName.toLowerCase();
  const ip = input.agentIp;

  for (const asset of assets) {
    if (asset.hostname && nameLower.includes(asset.hostname.toLowerCase())) {
      suggestions.push({
        assetId: asset.id,
        assetName: asset.name,
        clientId: asset.clientId,
        clientName: asset.client.name,
        reason: "Hostname match (requires analyst confirmation)",
      });
      continue;
    }
    if (asset.name && nameLower.includes(asset.name.toLowerCase())) {
      suggestions.push({
        assetId: asset.id,
        assetName: asset.name,
        clientId: asset.clientId,
        clientName: asset.client.name,
        reason: "Asset name similarity (requires analyst confirmation)",
      });
      continue;
    }
    if (ip && asset.hostname === ip) {
      suggestions.push({
        assetId: asset.id,
        assetName: asset.name,
        clientId: asset.clientId,
        clientName: asset.client.name,
        reason: "IP/hostname match (requires analyst confirmation)",
      });
    }
  }

  return suggestions.slice(0, 5);
}
