import type {
  ObservableType,
  Prisma,
  ThreatIntelLookupStatus,
  ThreatIntelRiskLevel,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { appendInvestigationActivity } from "@/services/investigations/investigation-activity.service";
import {
  isInternalHostname,
  isPrivateOrLocalIp,
  normalizeIp,
} from "@/services/investigations/observable-normalize";
import type { ThreatIntelLookupResult } from "@/types/investigations";

export type ThreatIntelProviderResult = {
  status: ThreatIntelLookupStatus;
  riskLevel?: ThreatIntelRiskLevel | null;
  confidence?: number | null;
  summary?: string | null;
  rawResponseSanitized?: Record<string, unknown> | null;
};

export interface ThreatIntelProvider {
  readonly name: string;
  lookup(input: {
    type: ObservableType;
    value: string;
    normalizedValue: string;
  }): Promise<ThreatIntelProviderResult>;
}

/**
 * Default provider when none is configured.
 * Never fabricates intel — returns ERROR/NOT_FOUND with a clear message.
 */
export class UnconfiguredProvider implements ThreatIntelProvider {
  readonly name = "unconfigured";

  async lookup(_input?: {
    type: ObservableType;
    value: string;
    normalizedValue: string;
  }): Promise<ThreatIntelProviderResult> {
    return {
      status: "ERROR",
      riskLevel: "UNKNOWN",
      confidence: null,
      summary: "Threat intelligence provider not configured.",
      rawResponseSanitized: {
        message: "Threat intelligence provider not configured.",
      },
    };
  }
}

const BLOCKED_TYPES: Set<ObservableType> = new Set([
  "USERNAME",
  "FILE_PATH",
  "PROCESS",
  "EMAIL",
]);

/**
 * Block private/local IPs, internal hostnames, and sensitive observable types
 * from leaving the environment.
 */
export function isSafeForExternalLookup(observable: {
  type: ObservableType;
  value: string;
  normalizedValue: string;
}): { safe: boolean; reason?: string } {
  if (BLOCKED_TYPES.has(observable.type)) {
    return {
      safe: false,
      reason: `${observable.type} observables must not be sent to external threat intel`,
    };
  }

  if (observable.type === "IP_ADDRESS") {
    const ip = normalizeIp(observable.normalizedValue) ?? normalizeIp(observable.value);
    if (!ip) {
      return { safe: false, reason: "Invalid IP address" };
    }
    if (isPrivateOrLocalIp(ip)) {
      return {
        safe: false,
        reason: "Private or local IP addresses cannot be looked up externally",
      };
    }
  }

  if (observable.type === "HOSTNAME" || observable.type === "DOMAIN") {
    if (isInternalHostname(observable.normalizedValue)) {
      return {
        safe: false,
        reason: "Internal hostnames cannot be looked up externally",
      };
    }
  }

  if (observable.type === "URL") {
    try {
      const u = new URL(observable.normalizedValue);
      const host = u.hostname.toLowerCase();
      if (isInternalHostname(host)) {
        return {
          safe: false,
          reason: "URLs with internal hosts cannot be looked up externally",
        };
      }
      const ip = normalizeIp(host);
      if (ip && isPrivateOrLocalIp(ip)) {
        return {
          safe: false,
          reason: "URLs with private IPs cannot be looked up externally",
        };
      }
    } catch {
      return { safe: false, reason: "Invalid URL" };
    }
  }

  return { safe: true };
}

function resolveProvider(): ThreatIntelProvider {
  const name = serverEnv.THREAT_INTEL_PROVIDER?.trim();
  if (!name || !serverEnv.THREAT_INTEL_ENABLED) {
    return new UnconfiguredProvider();
  }
  // Future providers can be registered here by name.
  // Until configured, always use UnconfiguredProvider.
  return new UnconfiguredProvider();
}

/**
 * Manual threat-intel lookup for a single observable.
 * Requires analyst confirmation at the action layer.
 * Never auto-bulk. Caches by expiresAt.
 */
export async function manualLookup(input: {
  organizationId: string;
  actorId: string;
  observableId: string;
  investigationGroupId?: string;
}): Promise<ThreatIntelLookupResult> {
  if (!serverEnv.THREAT_INTEL_ENABLED) {
    throw new Error("Threat intelligence lookups are disabled");
  }

  const observable = await prisma.securityObservable.findFirst({
    where: {
      id: input.observableId,
      organizationId: input.organizationId,
    },
  });
  if (!observable) throw new Error("Observable not found");

  const safety = isSafeForExternalLookup(observable);
  if (!safety.safe) {
    throw new Error(safety.reason ?? "Observable is not safe for external lookup");
  }

  const provider = resolveProvider();
  const cacheHours = serverEnv.THREAT_INTEL_CACHE_HOURS;
  const now = new Date();

  const cached = await prisma.threatIntelLookup.findFirst({
    where: {
      organizationId: input.organizationId,
      observableId: observable.id,
      provider: provider.name,
      status: { in: ["SUCCESS", "NOT_FOUND"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { lookedUpAt: "desc" },
  });

  if (cached) {
    return {
      id: cached.id,
      observableId: cached.observableId,
      provider: cached.provider,
      status: cached.status,
      riskLevel: cached.riskLevel,
      confidence: cached.confidence,
      summary: cached.summary,
      lookedUpAt: cached.lookedUpAt,
      expiresAt: cached.expiresAt,
      cached: true,
    };
  }

  const result = await provider.lookup({
    type: observable.type,
    value: observable.value,
    normalizedValue: observable.normalizedValue,
  });

  const expiresAt = new Date(now.getTime() + cacheHours * 60 * 60 * 1000);
  const row = await prisma.threatIntelLookup.create({
    data: {
      organizationId: input.organizationId,
      observableId: observable.id,
      provider: provider.name,
      status: result.status,
      riskLevel: result.riskLevel ?? "UNKNOWN",
      confidence: result.confidence ?? null,
      summary: result.summary?.slice(0, 2000) ?? null,
      rawResponseSanitized: (result.rawResponseSanitized ??
        undefined) as Prisma.InputJsonValue | undefined,
      lookedUpAt: now,
      expiresAt,
      requestedByUserId: input.actorId,
    },
  });

  if (input.investigationGroupId) {
    await appendInvestigationActivity({
      organizationId: input.organizationId,
      groupId: input.investigationGroupId,
      actorUserId: input.actorId,
      activityType: "THREAT_INTEL_LOOKUP",
      message: `Threat intel lookup for ${observable.type} (${result.status})`,
      metadata: {
        observableId: observable.id,
        lookupId: row.id,
        provider: provider.name,
        status: result.status,
      },
    });
  }

  return {
    id: row.id,
    observableId: row.observableId,
    provider: row.provider,
    status: row.status,
    riskLevel: row.riskLevel,
    confidence: row.confidence,
    summary: row.summary,
    lookedUpAt: row.lookedUpAt,
    expiresAt: row.expiresAt,
    cached: false,
  };
}
