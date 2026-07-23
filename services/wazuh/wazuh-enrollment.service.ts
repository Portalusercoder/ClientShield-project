import type {
  WazuhAgentEnrollment,
  WazuhEnrollmentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { buildEnrollmentInstructions } from "@/lib/wazuh/enrollment-instructions";
import type { PrepareEnrollmentInput } from "@/lib/validations/wazuh-enrollment";
import { createAuditLog } from "@/services/audit.service";
import { listWazuhAgents } from "@/services/wazuh/wazuh-manager-client.service";
import {
  ENDPOINT_ENROLLMENT_ASSET_TYPES,
  WAZUH_ENROLLMENT_EXPIRY_HOURS,
  type EnrollmentInstructions,
  type EnrollmentVerificationResult,
  type EndpointEnrollmentDisplayStatus,
  type EndpointWazuhReadiness,
  type WazuhAgentEnrollmentRecord,
} from "@/types/wazuh-enrollment";

function mapEnrollment(row: WazuhAgentEnrollment): WazuhAgentEnrollmentRecord {
  return { ...row };
}

function sanitizeError(message: string): string {
  return message
    .replace(/password[=:].+/gi, "password=[REDACTED]")
    .replace(/secret[=:].+/gi, "secret=[REDACTED]")
    .replace(/token[=:].+/gi, "token=[REDACTED]")
    .slice(0, 500);
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.local$/, "");
}

async function expireIfNeeded(
  enrollment: WazuhAgentEnrollment
): Promise<WazuhAgentEnrollment> {
  const terminal: WazuhEnrollmentStatus[] = [
    "VERIFIED",
    "REVOKED",
    "EXPIRED",
    "FAILED",
  ];
  if (terminal.includes(enrollment.status)) return enrollment;
  if (enrollment.expiresAt.getTime() > Date.now()) return enrollment;

  return prisma.wazuhAgentEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "EXPIRED",
      lastErrorSanitized: "Enrollment expired before verification completed",
    },
  });
}

/**
 * Prepare a remote endpoint enrollment request.
 * Does not issue Wazuh secrets. Asset must be AUTHORIZED WORKSTATION/SERVER.
 */
export async function prepareWazuhEnrollment(input: {
  organizationId: string;
  actorId: string;
  data: PrepareEnrollmentInput;
}): Promise<{
  enrollment: WazuhAgentEnrollmentRecord;
  instructions: EnrollmentInstructions;
}> {
  if (serverEnv.WAZUH_ORGANIZATION_ID !== input.organizationId) {
    throw new Error("Wazuh enrollment is not configured for this organization");
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: input.data.assetId,
      organizationId: input.organizationId,
    },
  });
  if (!asset) throw new Error("Asset not found");

  if (
    !(ENDPOINT_ENROLLMENT_ASSET_TYPES as readonly string[]).includes(asset.type)
  ) {
    throw new Error(
      "Remote enrollment supports WORKSTATION and SERVER assets only"
    );
  }

  if (asset.authorizationStatus !== "AUTHORIZED") {
    throw new Error(
      "Asset must be explicitly AUTHORIZED before preparing enrollment"
    );
  }

  const activeMapping = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      status: "ACTIVE",
    },
  });
  if (activeMapping) {
    throw new Error(
      "Asset already has an active Wazuh agent mapping. Revoke or deactivate it before re-enrolling."
    );
  }

  const openEnrollment = await prisma.wazuhAgentEnrollment.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: asset.id,
      status: { in: ["PENDING", "READY", "ENROLLING", "ENROLLED", "VERIFIED"] },
    },
  });
  if (openEnrollment) {
    throw new Error(
      "An open enrollment already exists for this asset. Revoke or wait for expiry."
    );
  }

  const expiresAt = new Date(
    Date.now() + WAZUH_ENROLLMENT_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const enrollment = await prisma.wazuhAgentEnrollment.create({
    data: {
      organizationId: input.organizationId,
      clientId: asset.clientId,
      assetId: asset.id,
      agentName: input.data.agentName,
      expectedHostname: input.data.expectedHostname,
      platform: input.data.platform,
      architecture: input.data.architecture,
      status: "READY",
      connectionHint:
        input.data.connectionHint ??
        "Reach manager only via approved private overlay (Tailscale/WireGuard/VPN). Ports 1514/1515 remain localhost-bound until infrastructure approval.",
      expiresAt,
      createdByUserId: input.actorId,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_ENROLLMENT_PREPARED",
    resourceType: "WazuhAgentEnrollment",
    resourceId: enrollment.id,
    metadata: {
      clientId: asset.clientId,
      assetId: asset.id,
      agentName: enrollment.agentName,
      platform: enrollment.platform,
      expiresAt: enrollment.expiresAt.toISOString(),
    },
  });

  const instructions = buildEnrollmentInstructions({
    platform: enrollment.platform,
    architecture: enrollment.architecture,
    agentName: enrollment.agentName,
    expectedHostname: enrollment.expectedHostname,
  });

  return { enrollment: mapEnrollment(enrollment), instructions };
}

export async function getEnrollmentById(
  organizationId: string,
  enrollmentId: string
): Promise<WazuhAgentEnrollmentRecord | null> {
  const row = await prisma.wazuhAgentEnrollment.findFirst({
    where: { id: enrollmentId, organizationId },
  });
  if (!row) return null;
  return mapEnrollment(await expireIfNeeded(row));
}

export async function listEnrollmentsForAsset(
  organizationId: string,
  assetId: string
): Promise<WazuhAgentEnrollmentRecord[]> {
  const rows = await prisma.wazuhAgentEnrollment.findMany({
    where: { organizationId, assetId },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(
    rows.map(async (r) => mapEnrollment(await expireIfNeeded(r)))
  );
}

export async function listEnrollmentsForClient(
  organizationId: string,
  clientId: string
): Promise<WazuhAgentEnrollmentRecord[]> {
  const rows = await prisma.wazuhAgentEnrollment.findMany({
    where: { organizationId, clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Promise.all(
    rows.map(async (r) => mapEnrollment(await expireIfNeeded(r)))
  );
}

export function getEnrollmentInstructions(
  enrollment: WazuhAgentEnrollmentRecord
): EnrollmentInstructions {
  return buildEnrollmentInstructions({
    platform: enrollment.platform,
    architecture: enrollment.architecture,
    agentName: enrollment.agentName,
    expectedHostname: enrollment.expectedHostname,
  });
}

/**
 * Verify enrollment against live Wazuh Manager inventory (read-only API).
 * Does not auto-map.
 */
export async function verifyWazuhEnrollment(input: {
  organizationId: string;
  actorId: string;
  enrollmentId: string;
}): Promise<EnrollmentVerificationResult> {
  if (serverEnv.WAZUH_ORGANIZATION_ID !== input.organizationId) {
    throw new Error("Wazuh enrollment is not configured for this organization");
  }

  let enrollment = await prisma.wazuhAgentEnrollment.findFirst({
    where: { id: input.enrollmentId, organizationId: input.organizationId },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  enrollment = await expireIfNeeded(enrollment);
  if (enrollment.status === "EXPIRED") {
    throw new Error("Enrollment has expired");
  }
  if (enrollment.status === "REVOKED") {
    throw new Error("Enrollment has been revoked");
  }

  const agents = await listWazuhAgents();
  const expectedName = normalizeHost(enrollment.agentName);
  const expectedHost = normalizeHost(enrollment.expectedHostname);

  const match =
    agents.find((a) => a.id !== "000" && normalizeHost(a.name) === expectedName) ??
    agents.find(
      (a) =>
        a.id !== "000" &&
        a.name &&
        normalizeHost(a.name) === expectedHost
    ) ??
    null;

  if (!match) {
    const failed = await prisma.wazuhAgentEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: enrollment.status === "READY" ? "ENROLLING" : enrollment.status,
        lastErrorSanitized:
          "No matching agent found in Wazuh Manager inventory yet. Confirm install and private connectivity.",
        hostnameMismatch: false,
        observedHostname: null,
      },
    });

    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "WAZUH_ENROLLMENT_VERIFY_PENDING",
      resourceType: "WazuhAgentEnrollment",
      resourceId: enrollment.id,
      metadata: { assetId: enrollment.assetId, clientId: enrollment.clientId },
    });

    return {
      enrollment: mapEnrollment(failed),
      matchedAgentId: null,
      matchedAgentName: null,
      matchedAgentStatus: null,
      hostnameMismatch: false,
      observedHostname: null,
      message: failed.lastErrorSanitized ?? "Agent not found",
    };
  }

  const observed = match.name ?? null;
  const hostnameMismatch =
    observed != null &&
    normalizeHost(observed) !== expectedHost &&
    normalizeHost(observed) !== expectedName;

  const updated = await prisma.wazuhAgentEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: hostnameMismatch ? "ENROLLED" : "VERIFIED",
      wazuhAgentId: match.id,
      enrolledAt: enrollment.enrolledAt ?? new Date(),
      verifiedAt: hostnameMismatch ? enrollment.verifiedAt : new Date(),
      hostnameMismatch,
      observedHostname: observed,
      lastErrorSanitized: hostnameMismatch
        ? `Hostname mismatch: expected ${enrollment.expectedHostname}, observed ${observed}`
        : null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: hostnameMismatch
      ? "WAZUH_ENROLLMENT_HOSTNAME_MISMATCH"
      : "WAZUH_ENROLLMENT_VERIFIED",
    resourceType: "WazuhAgentEnrollment",
    resourceId: enrollment.id,
    metadata: {
      assetId: enrollment.assetId,
      clientId: enrollment.clientId,
      wazuhAgentId: match.id,
      hostnameMismatch,
      // Never log secrets; observed hostname is operational metadata.
      observedHostname: observed,
    },
  });

  return {
    enrollment: mapEnrollment(updated),
    matchedAgentId: match.id,
    matchedAgentName: match.name,
    matchedAgentStatus: match.status,
    hostnameMismatch,
    observedHostname: observed,
    message: hostnameMismatch
      ? `Agent ${match.id} found but hostname differs from expected. Review before mapping.`
      : `Agent ${match.id} verified against Manager inventory.`,
  };
}

/**
 * Map a verified/enrolled agent to the enrollment's asset.
 * Never maps agent 000. Blocks silent remaps without confirmRemap.
 */
export async function mapEnrollmentToAgent(input: {
  organizationId: string;
  actorId: string;
  enrollmentId: string;
  wazuhAgentId: string;
  confirmRemap?: boolean;
}): Promise<WazuhAgentEnrollmentRecord> {
  if (input.wazuhAgentId === "000") {
    throw new Error("Manager agent 000 cannot be mapped");
  }
  if (serverEnv.WAZUH_ORGANIZATION_ID !== input.organizationId) {
    throw new Error("Wazuh mapping is not configured for this organization");
  }

  let enrollment = await prisma.wazuhAgentEnrollment.findFirst({
    where: { id: input.enrollmentId, organizationId: input.organizationId },
    include: { asset: true },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  const expiredCheck = await expireIfNeeded(enrollment);
  enrollment = { ...enrollment, ...expiredCheck };

  if (enrollment.status === "EXPIRED" || enrollment.status === "REVOKED") {
    throw new Error(`Cannot map enrollment in status ${enrollment.status}`);
  }

  if (
    enrollment.status !== "VERIFIED" &&
    enrollment.status !== "ENROLLED"
  ) {
    throw new Error("Verify enrollment against Wazuh inventory before mapping");
  }

  if (enrollment.asset.authorizationStatus !== "AUTHORIZED") {
    throw new Error("Asset authorization is required before mapping");
  }

  if (
    enrollment.wazuhAgentId &&
    enrollment.wazuhAgentId !== input.wazuhAgentId
  ) {
    throw new Error(
      `Enrollment is linked to agent ${enrollment.wazuhAgentId}; refuse mapping to ${input.wazuhAgentId}`
    );
  }

  const existingAgentMap = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      wazuhAgentId: input.wazuhAgentId,
      status: "ACTIVE",
    },
  });

  if (
    existingAgentMap &&
    (existingAgentMap.assetId !== enrollment.assetId ||
      existingAgentMap.clientId !== enrollment.clientId)
  ) {
    if (!input.confirmRemap) {
      throw new Error(
        "Agent is already mapped to another asset/client. Remap requires explicit confirmation."
      );
    }
    await prisma.wazuhAgentMapping.update({
      where: { id: existingAgentMap.id },
      data: {
        status: "INACTIVE",
        inactiveAt: new Date(),
        inactiveReason: "Remapped via enrollment confirmation",
      },
    });
    await createAuditLog({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "WAZUH_AGENT_MAPPING_DEACTIVATED",
      resourceType: "WazuhAgentMapping",
      resourceId: existingAgentMap.wazuhAgentId,
      metadata: {
        previousClientId: existingAgentMap.clientId,
        previousAssetId: existingAgentMap.assetId,
        reason: "remap_confirmed",
      },
    });
  }

  const existingAssetMap = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId: input.organizationId,
      assetId: enrollment.assetId,
      status: "ACTIVE",
      NOT: { wazuhAgentId: input.wazuhAgentId },
    },
  });
  if (existingAssetMap) {
    throw new Error(
      "Asset already has a different active Wazuh agent mapping"
    );
  }

  const agents = await listWazuhAgents();
  const agent = agents.find((a) => a.id === input.wazuhAgentId);
  if (!agent) {
    throw new Error("Agent not found in Wazuh Manager inventory");
  }

  const mapping = await prisma.wazuhAgentMapping.upsert({
    where: {
      organizationId_wazuhAgentId: {
        organizationId: input.organizationId,
        wazuhAgentId: input.wazuhAgentId,
      },
    },
    create: {
      organizationId: input.organizationId,
      wazuhAgentId: input.wazuhAgentId,
      wazuhAgentName: agent.name,
      clientId: enrollment.clientId,
      assetId: enrollment.assetId,
      mappedByUserId: input.actorId,
      status: "ACTIVE",
      lastKnownStatus: agent.status,
      lastSeenAt: agent.lastKeepAlive
        ? new Date(agent.lastKeepAlive)
        : new Date(),
    },
    update: {
      wazuhAgentName: agent.name,
      clientId: enrollment.clientId,
      assetId: enrollment.assetId,
      mappedByUserId: input.actorId,
      status: "ACTIVE",
      inactiveAt: null,
      inactiveReason: null,
      lastKnownStatus: agent.status,
      lastSeenAt: agent.lastKeepAlive
        ? new Date(agent.lastKeepAlive)
        : new Date(),
    },
  });

  const updated = await prisma.wazuhAgentEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "VERIFIED",
      wazuhAgentId: input.wazuhAgentId,
      mappingId: mapping.id,
      verifiedAt: new Date(),
      enrolledAt: enrollment.enrolledAt ?? new Date(),
      lastErrorSanitized: null,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_ENROLLMENT_MAPPED",
    resourceType: "WazuhAgentEnrollment",
    resourceId: enrollment.id,
    metadata: {
      clientId: enrollment.clientId,
      assetId: enrollment.assetId,
      wazuhAgentId: input.wazuhAgentId,
      mappingId: mapping.id,
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_AGENT_MAPPED",
    resourceType: "WazuhAgentMapping",
    resourceId: input.wazuhAgentId,
    metadata: {
      clientId: enrollment.clientId,
      assetId: enrollment.assetId,
      enrollmentId: enrollment.id,
    },
  });

  return mapEnrollment(updated);
}

export async function revokeWazuhEnrollment(input: {
  organizationId: string;
  actorId: string;
  enrollmentId: string;
  deactivateMapping?: boolean;
}): Promise<WazuhAgentEnrollmentRecord> {
  const enrollment = await prisma.wazuhAgentEnrollment.findFirst({
    where: { id: input.enrollmentId, organizationId: input.organizationId },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  if (input.deactivateMapping && enrollment.mappingId) {
    await prisma.wazuhAgentMapping.updateMany({
      where: {
        id: enrollment.mappingId,
        organizationId: input.organizationId,
        status: "ACTIVE",
      },
      data: {
        status: "INACTIVE",
        inactiveAt: new Date(),
        inactiveReason: "Enrollment revoked — remove agent in Wazuh Manager separately",
      },
    });
  }

  const updated = await prisma.wazuhAgentEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      lastErrorSanitized:
        "Enrollment revoked. Wazuh agent was not deleted automatically — disable/remove in Manager if required.",
    },
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "WAZUH_ENROLLMENT_REVOKED",
    resourceType: "WazuhAgentEnrollment",
    resourceId: enrollment.id,
    metadata: {
      clientId: enrollment.clientId,
      assetId: enrollment.assetId,
      wazuhAgentId: enrollment.wazuhAgentId,
      mappingDeactivated: Boolean(input.deactivateMapping),
    },
  });

  return mapEnrollment(updated);
}

export async function calculateEndpointWazuhReadiness(
  organizationId: string,
  assetId: string
): Promise<EndpointWazuhReadiness | null> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
  });
  if (!asset) return null;

  if (
    !(ENDPOINT_ENROLLMENT_ASSET_TYPES as readonly string[]).includes(asset.type)
  ) {
    return {
      displayStatus: "NOT_CONFIGURED",
      enrollmentStatus: null,
      mappedAgentId: null,
      agentLiveStatus: null,
      authorized: asset.authorizationStatus === "AUTHORIZED",
      message: "Asset type is not an endpoint enrollment target",
    };
  }

  const authorized = asset.authorizationStatus === "AUTHORIZED";
  const mapping = await prisma.wazuhAgentMapping.findFirst({
    where: {
      organizationId,
      assetId,
      status: "ACTIVE",
      NOT: { wazuhAgentId: "000" },
    },
  });

  const enrollment = await prisma.wazuhAgentEnrollment.findFirst({
    where: {
      organizationId,
      assetId,
      status: {
        in: ["PENDING", "READY", "ENROLLING", "ENROLLED", "VERIFIED"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let agentLiveStatus: string | null = null;
  if (mapping && serverEnv.WAZUH_ENABLED) {
    try {
      const agents = await listWazuhAgents();
      agentLiveStatus =
        agents.find((a) => a.id === mapping.wazuhAgentId)?.status ?? null;
    } catch (err) {
      return {
        displayStatus: "ERROR",
        enrollmentStatus: enrollment?.status ?? null,
        mappedAgentId: mapping.wazuhAgentId,
        agentLiveStatus: null,
        authorized,
        message: sanitizeError(
          err instanceof Error ? err.message : "Failed to query Wazuh agents"
        ),
      };
    }
  }

  let displayStatus: EndpointEnrollmentDisplayStatus = "NOT_CONFIGURED";
  let message = "Prepare enrollment for this authorized endpoint";

  if (!authorized) {
    displayStatus = "NOT_CONFIGURED";
    message = "Authorize the asset before remote enrollment";
  } else if (mapping && agentLiveStatus?.toLowerCase() === "active") {
    displayStatus = "CONNECTED";
    message = `Agent ${mapping.wazuhAgentId} mapped and active`;
  } else if (mapping && agentLiveStatus) {
    displayStatus = "DISCONNECTED";
    message = `Agent ${mapping.wazuhAgentId} mapped but status is ${agentLiveStatus}`;
  } else if (mapping) {
    displayStatus = "CONNECTED";
    message = `Agent ${mapping.wazuhAgentId} mapped`;
  } else if (
    enrollment &&
    (enrollment.status === "VERIFIED" || enrollment.status === "ENROLLED")
  ) {
    displayStatus = "MAPPING_REQUIRED";
    message = "Enrollment verified — map the agent to this asset";
  } else if (enrollment) {
    displayStatus = "PENDING_ENROLLMENT";
    message = `Enrollment ${enrollment.status.toLowerCase()} — complete install then verify`;
  } else if (
    enrollment === null &&
    // check if any enrolled without mapping via ENROLLED status already covered
    false
  ) {
    displayStatus = "ENROLLED";
  }

  return {
    displayStatus,
    enrollmentStatus: enrollment?.status ?? null,
    mappedAgentId: mapping?.wazuhAgentId ?? null,
    agentLiveStatus,
    authorized,
    message,
  };
}
