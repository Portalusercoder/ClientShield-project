import type { ObservableRole, ObservableType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  looksLikeSecret,
  normalizeDomain,
  normalizeFilePath,
  normalizeHash,
  normalizeIp,
  normalizeProcess,
  normalizeUrl,
  normalizeUsername,
} from "@/services/investigations/observable-normalize";

function logObs(level: "warn" | "error", message: string, meta?: object) {
  // eslint-disable-next-line no-console
  console[level](
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "observable.service",
      level,
      message,
      ...meta,
    })
  );
}

export async function upsertObservable(input: {
  organizationId: string;
  type: ObservableType;
  value: string;
  normalizedValue: string;
}): Promise<{ id: string }> {
  const now = new Date();
  const row = await prisma.securityObservable.upsert({
    where: {
      organizationId_type_normalizedValue: {
        organizationId: input.organizationId,
        type: input.type,
        normalizedValue: input.normalizedValue,
      },
    },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      value: input.value.slice(0, 2000),
      normalizedValue: input.normalizedValue,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
      value: input.value.slice(0, 2000),
    },
    select: { id: true },
  });
  return row;
}

export async function linkEventObservable(input: {
  organizationId: string;
  securityEventId: string;
  observableId: string;
  role: ObservableRole;
}): Promise<void> {
  await prisma.securityEventObservable.upsert({
    where: {
      securityEventId_observableId_role: {
        securityEventId: input.securityEventId,
        observableId: input.observableId,
        role: input.role,
      },
    },
    create: {
      organizationId: input.organizationId,
      securityEventId: input.securityEventId,
      observableId: input.observableId,
      role: input.role,
    },
    update: {},
  });
}

async function linkNormalized(input: {
  organizationId: string;
  securityEventId: string;
  type: ObservableType;
  rawValue: string;
  normalizedValue: string;
  role: ObservableRole;
}): Promise<void> {
  const obs = await upsertObservable({
    organizationId: input.organizationId,
    type: input.type,
    value: input.rawValue,
    normalizedValue: input.normalizedValue,
  });
  await linkEventObservable({
    organizationId: input.organizationId,
    securityEventId: input.securityEventId,
    observableId: obs.id,
    role: input.role,
  });
}

function readAllowlistedRaw(
  raw: unknown
): { domain?: string; url?: string; md5?: string; sha1?: string; sha256?: string; hostname?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const root = raw as Record<string, unknown>;
  const out: {
    domain?: string;
    url?: string;
    md5?: string;
    sha1?: string;
    sha256?: string;
    hostname?: string;
  } = {};

  const take = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key];
    return typeof v === "string" ? v : undefined;
  };

  // Top-level allowlisted keys only when present as explicit keys
  for (const key of ["domain", "url", "md5", "sha1", "sha256", "hostname"] as const) {
    const v = take(root, key);
    if (v) out[key] = v;
  }

  // data / syscheck nested objects (Wazuh-shaped)
  for (const nestKey of ["data", "syscheck"] as const) {
    const nest = root[nestKey];
    if (nest && typeof nest === "object" && !Array.isArray(nest)) {
      const n = nest as Record<string, unknown>;
      for (const key of ["domain", "url", "md5", "sha1", "sha256", "hostname"] as const) {
        if (!out[key]) {
          const v = take(n, key);
          if (v) out[key] = v;
        }
      }
    }
  }

  return out;
}

/**
 * Extract observables from a security event's columns + carefully allowlisted
 * rawDataSanitized keys. Failures are logged and never thrown to callers.
 */
export async function extractAndLinkObservablesFromSecurityEvent(
  eventId: string
): Promise<{ linked: number }> {
  try {
    const event = await prisma.securityEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) return { linked: 0 };

    const orgId = event.organizationId;
    let linked = 0;

    const tryLink = async (
      type: ObservableType,
      raw: string | null | undefined,
      normalize: (v: string) => string | null,
      role: ObservableRole
    ) => {
      if (!raw || looksLikeSecret(raw)) return;
      const normalized = normalize(raw);
      if (!normalized) return;
      await linkNormalized({
        organizationId: orgId,
        securityEventId: event.id,
        type,
        rawValue: raw,
        normalizedValue: normalized,
        role,
      });
      linked += 1;
    };

    await tryLink("IP_ADDRESS", event.sourceIp, normalizeIp, "SOURCE");
    await tryLink(
      "IP_ADDRESS",
      event.destinationIp,
      normalizeIp,
      "DESTINATION"
    );
    await tryLink("USERNAME", event.username, normalizeUsername, "SUBJECT");
    await tryLink("PROCESS", event.processName, normalizeProcess, "PROCESS");
    await tryLink("FILE_PATH", event.filePath, normalizeFilePath, "FILE");

    if (event.agentName) {
      await tryLink("HOSTNAME", event.agentName, normalizeDomain, "SUBJECT");
    }

    const rawBits = readAllowlistedRaw(event.rawDataSanitized);
    await tryLink("DOMAIN", rawBits.domain, normalizeDomain, "NETWORK");
    await tryLink("URL", rawBits.url, normalizeUrl, "NETWORK");
    await tryLink("HOSTNAME", rawBits.hostname, normalizeDomain, "SUBJECT");
    await tryLink("FILE_HASH", rawBits.md5, normalizeHash, "FILE");
    await tryLink("FILE_HASH", rawBits.sha1, normalizeHash, "FILE");
    await tryLink("FILE_HASH", rawBits.sha256, normalizeHash, "FILE");

    return { linked };
  } catch (error) {
    logObs("error", "extractAndLinkObservablesFromSecurityEvent failed", {
      eventId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { linked: 0 };
  }
}

/**
 * Backfill observables for recent events in an organization.
 */
export async function backfillObservablesForOrganization(
  organizationId: string,
  limit = 200
): Promise<{ processed: number; linkedTotal: number }> {
  const events = await prisma.securityEvent.findMany({
    where: { organizationId },
    orderBy: { lastSeenAt: "desc" },
    take: Math.min(Math.max(limit, 1), 2000),
    select: { id: true },
  });

  let linkedTotal = 0;
  for (const e of events) {
    const result = await extractAndLinkObservablesFromSecurityEvent(e.id);
    linkedTotal += result.linked;
  }
  return { processed: events.length, linkedTotal };
}

export async function getFileHashesForEvent(
  organizationId: string,
  securityEventId: string
): Promise<string[]> {
  const links = await prisma.securityEventObservable.findMany({
    where: {
      organizationId,
      securityEventId,
      observable: { type: "FILE_HASH" },
    },
    include: { observable: { select: { normalizedValue: true } } },
  });
  return links.map((l) => l.observable.normalizedValue);
}

export type { Prisma };
