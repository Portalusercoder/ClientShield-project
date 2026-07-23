import type {
  AssetAuthorizationStatus,
  AssetType,
  ClientServiceType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ClientReadinessResult,
  ReadinessCheck,
  ReadinessOverall,
  WazuhReadinessResult,
} from "@/types/client-onboarding";

const WEBSITE_ASSET_TYPES: AssetType[] = ["WEBSITE", "WEB_APPLICATION"];
const ENDPOINT_ASSET_TYPES: AssetType[] = ["WORKSTATION", "SERVER"];
const WEBSITE_SERVICES: ClientServiceType[] = [
  "PASSIVE_WEB_MONITORING",
  "ZAP_BASELINE",
];
const ZAP_SERVICE: ClientServiceType = "ZAP_BASELINE";
const WAZUH_SERVICE: ClientServiceType = "WAZUH_ENDPOINT_MONITORING";

function overallFromChecks(checks: ReadinessCheck[]): ReadinessOverall {
  if (checks.some((c) => c.blocked && !c.passed)) return "BLOCKED";
  if (checks.every((c) => c.passed)) return "READY";
  return "NOT_READY";
}

/**
 * Calculates onboarding readiness from live org-scoped data.
 * Enabling a service ≠ ready — asset/auth checks still apply.
 */
export async function calculateClientReadiness(
  organizationId: string,
  clientId: string
): Promise<ClientReadinessResult | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: {
      id: true,
      name: true,
      primaryContactEmail: true,
    },
  });

  if (!client) return null;

  const [contactCount, assets, services] = await Promise.all([
    prisma.clientContact.count({
      where: { organizationId, clientId },
    }),
    prisma.asset.findMany({
      where: { organizationId, clientId },
      select: {
        id: true,
        type: true,
        authorizationStatus: true,
      },
    }),
    prisma.clientService.findMany({
      where: {
        organizationId,
        clientId,
        status: { in: ["ACTIVE", "PLANNED"] },
      },
      select: { serviceType: true, status: true },
    }),
  ]);

  const serviceTypes = new Set(services.map((s) => s.serviceType));
  const needsWebsiteAssets = WEBSITE_SERVICES.some((t) => serviceTypes.has(t));
  const needsZapAuth = serviceTypes.has(ZAP_SERVICE);
  const needsWazuhAssets = serviceTypes.has(WAZUH_SERVICE);

  const websiteAssets = assets.filter((a) =>
    WEBSITE_ASSET_TYPES.includes(a.type)
  );
  const endpointAssets = assets.filter((a) =>
    ENDPOINT_ASSET_TYPES.includes(a.type)
  );

  const zapTargets = needsZapAuth ? websiteAssets : [];
  const unauthorizedZap = zapTargets.filter(
    (a) => a.authorizationStatus === "NOT_AUTHORIZED"
  );
  const pendingZap = zapTargets.filter(
    (a) => a.authorizationStatus === "PENDING"
  );
  const allZapAuthorized =
    zapTargets.length === 0 ||
    zapTargets.every(
      (a) => (a.authorizationStatus as AssetAuthorizationStatus) === "AUTHORIZED"
    );

  const checks: ReadinessCheck[] = [
    {
      key: "profile",
      label: "Client profile",
      passed: Boolean(client.name?.trim()),
      message: client.name?.trim()
        ? "Client name is set"
        : "Client name is required",
    },
    {
      key: "contacts",
      label: "Contacts",
      passed: contactCount >= 1 || Boolean(client.primaryContactEmail?.trim()),
      message:
        contactCount >= 1 || client.primaryContactEmail?.trim()
          ? "At least one contact is available"
          : "Add a contact or set a primary contact email",
    },
    {
      key: "assets",
      label: "Assets",
      passed: assets.length >= 1,
      message:
        assets.length >= 1
          ? `${assets.length} asset(s) registered`
          : "Register at least one asset",
    },
    {
      key: "services",
      label: "Services",
      passed: services.length >= 1,
      message:
        services.length >= 1
          ? `${services.length} planned/active service(s)`
          : "Enable at least one planned or active service",
    },
    {
      key: "authorization",
      label: "Scan authorization",
      passed: !needsZapAuth || allZapAuthorized,
      blocked: unauthorizedZap.length > 0,
      message: !needsZapAuth
        ? "ZAP baseline not in scope"
        : unauthorizedZap.length > 0
          ? `${unauthorizedZap.length} web asset(s) are not authorized for active scanning`
          : pendingZap.length > 0
            ? `${pendingZap.length} web asset(s) still pending authorization`
            : zapTargets.length === 0
              ? "No web assets to authorize for ZAP"
              : "Web assets are authorized for ZAP scanning",
    },
    {
      key: "wazuh_assets",
      label: "Endpoint assets for Wazuh",
      passed: !needsWazuhAssets || endpointAssets.length >= 1,
      message: !needsWazuhAssets
        ? "Wazuh endpoint monitoring not in scope"
        : endpointAssets.length >= 1
          ? `${endpointAssets.length} workstation/server asset(s)`
          : "Add workstation or server assets for Wazuh monitoring",
    },
    {
      key: "website_assets",
      label: "Website assets",
      passed: !needsWebsiteAssets || websiteAssets.length >= 1,
      message: !needsWebsiteAssets
        ? "Website services not in scope"
        : websiteAssets.length >= 1
          ? `${websiteAssets.length} website/web application asset(s)`
          : "Add website or web application assets for web monitoring services",
    },
  ];

  const overall = overallFromChecks(checks);
  const blockers = checks
    .filter((c) => !c.passed)
    .map((c) => c.message);

  return { overall, checks, blockers };
}

/**
 * Wazuh connection readiness for a client.
 * Manager API health alone is never enough — requires authorized endpoints + mapping.
 * Agent id "000" (manager) is excluded from mapped counts.
 */
export async function calculateWazuhReadiness(
  organizationId: string,
  clientId: string
): Promise<WazuhReadinessResult | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  if (!client) return null;

  const [wazuhService, endpointAssets, mappings, enrollments] =
    await Promise.all([
      prisma.clientService.findFirst({
        where: {
          organizationId,
          clientId,
          serviceType: WAZUH_SERVICE,
          status: { in: ["ACTIVE", "PLANNED"] },
        },
        select: { id: true },
      }),
      prisma.asset.findMany({
        where: {
          organizationId,
          clientId,
          type: { in: ENDPOINT_ASSET_TYPES },
        },
        select: { id: true, authorizationStatus: true },
      }),
      prisma.wazuhAgentMapping.findMany({
        where: {
          organizationId,
          clientId,
          status: "ACTIVE",
          NOT: { wazuhAgentId: "000" },
        },
        select: { wazuhAgentId: true, lastKnownStatus: true },
      }),
      prisma.wazuhAgentEnrollment.findMany({
        where: {
          organizationId,
          clientId,
          status: {
            in: ["PENDING", "READY", "ENROLLING", "ENROLLED", "VERIFIED"],
          },
        },
        select: { status: true, assetId: true },
      }),
    ]);

  const endpointAssetCount = endpointAssets.length;
  const authorizedEndpointCount = endpointAssets.filter(
    (a) => a.authorizationStatus === "AUTHORIZED"
  ).length;
  const mappedAgentCount = mappings.length;
  const pendingEnrollmentCount = enrollments.filter((e) =>
    ["PENDING", "READY", "ENROLLING"].includes(e.status)
  ).length;
  const verifiedUnmapped = enrollments.filter(
    (e) => e.status === "VERIFIED" || e.status === "ENROLLED"
  ).length;

  if (!wazuhService) {
    return {
      status: "NOT_APPLICABLE",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message: "Wazuh endpoint monitoring is not enabled for this client",
    };
  }

  if (endpointAssetCount < 1) {
    return {
      status: "NOT_CONFIGURED",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message: "Add workstation or server assets for Wazuh monitoring",
    };
  }

  if (authorizedEndpointCount < 1) {
    return {
      status: "NOT_CONFIGURED",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message: "Authorize at least one endpoint asset before enrollment",
    };
  }

  if (mappedAgentCount >= 1) {
    const disconnected = mappings.some(
      (m) =>
        m.lastKnownStatus &&
        m.lastKnownStatus.toLowerCase() !== "active"
    );
    if (disconnected) {
      return {
        status: "DISCONNECTED",
        endpointAssetCount,
        mappedAgentCount,
        authorizedEndpointCount,
        pendingEnrollmentCount,
        message: `${mappedAgentCount} mapped agent(s); at least one is not active in last-known status`,
      };
    }
    return {
      status: "CONNECTED",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message: `${mappedAgentCount} agent(s) mapped to authorized endpoint asset(s)`,
    };
  }

  if (verifiedUnmapped >= 1) {
    return {
      status: "MAPPING_REQUIRED",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message:
        "Enrollment verified in Wazuh inventory — complete explicit asset mapping",
    };
  }

  if (pendingEnrollmentCount >= 1) {
    return {
      status: "PENDING_ENROLLMENT",
      endpointAssetCount,
      mappedAgentCount,
      authorizedEndpointCount,
      pendingEnrollmentCount,
      message: `${pendingEnrollmentCount} enrollment(s) awaiting agent install/verify`,
    };
  }

  return {
    status: "SETUP_REQUIRED",
    endpointAssetCount,
    mappedAgentCount,
    authorizedEndpointCount,
    pendingEnrollmentCount,
    message:
      "Prepare remote enrollment for an authorized endpoint, then verify and map the agent",
  };
}
