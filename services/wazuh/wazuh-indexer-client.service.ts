import https from "node:https";
import { URL } from "node:url";
import { serverEnv } from "@/lib/env";
import { createWazuhTlsAgent } from "@/lib/wazuh/tls";

export interface WazuhIndexerHit {
  _id: string;
  _index?: string;
  _source: Record<string, unknown>;
  sort?: unknown[];
}

export interface WazuhIndexerSearchResult {
  hits: WazuhIndexerHit[];
  total: number;
}

function assertWazuhEnabled(): void {
  if (!serverEnv.WAZUH_ENABLED) {
    throw new Error("Wazuh integration is disabled (WAZUH_ENABLED=false)");
  }
}

async function indexerRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  assertWazuhEnabled();
  const base = serverEnv.WAZUH_INDEXER_URL;
  if (!base) throw new Error("WAZUH_INDEXER_URL is not configured");
  if (!serverEnv.WAZUH_INDEXER_USERNAME || !serverEnv.WAZUH_INDEXER_PASSWORD) {
    throw new Error("Wazuh Indexer credentials are not configured");
  }

  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  const agent = createWazuhTlsAgent(
    serverEnv.WAZUH_INDEXER_TLS_SERVERNAME
  );
  const auth = Buffer.from(
    `${serverEnv.WAZUH_INDEXER_USERNAME}:${serverEnv.WAZUH_INDEXER_PASSWORD}`
  ).toString("base64");

  const payload = body == null ? undefined : JSON.stringify(body);

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        agent,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(payload
            ? { "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `Wazuh Indexer request failed (${res.statusCode ?? "unknown"})`
              )
            );
            return;
          }
          try {
            resolve(text ? (JSON.parse(text) as T) : ({} as T));
          } catch {
            reject(new Error("Invalid JSON from Wazuh Indexer"));
          }
        });
      }
    );
    req.on("error", (err) =>
      reject(new Error(`Wazuh Indexer unreachable: ${err.message}`))
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Wazuh Indexer request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export async function checkWazuhIndexerHealth(): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  try {
    const health = await indexerRequest<{ status?: string }>(
      "GET",
      "/_cluster/health"
    );
    return { ok: true, status: health.status ?? "unknown" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Indexer unavailable",
    };
  }
}

/**
 * Search wazuh-alerts-* incrementally using search_after when available.
 * GET/search only — never mutate Indexer data.
 */
export async function searchWazuhAlerts(input: {
  afterTimestamp?: Date | null;
  afterDocumentId?: string | null;
  size: number;
}): Promise<WazuhIndexerSearchResult> {
  const must: Record<string, unknown>[] = [];
  if (input.afterTimestamp) {
    must.push({
      range: {
        timestamp: {
          gt: input.afterTimestamp.toISOString(),
        },
      },
    });
  }

  const body: Record<string, unknown> = {
    size: input.size,
    sort: [{ timestamp: "asc" }, { _id: "asc" }],
    query: must.length
      ? { bool: { must } }
      : { match_all: {} },
    _source: true,
  };

  const result = await indexerRequest<{
    hits?: {
      total?: { value?: number } | number;
      hits?: WazuhIndexerHit[];
    };
  }>("POST", "/wazuh-alerts-*/_search", body);

  const hits = result.hits?.hits ?? [];
  const totalRaw = result.hits?.total;
  const total =
    typeof totalRaw === "number"
      ? totalRaw
      : typeof totalRaw === "object"
        ? (totalRaw?.value ?? hits.length)
        : hits.length;

  return { hits, total };
}

/**
 * Read-only: return the newest alert timestamp in wazuh-alerts-*, if any.
 * Used to initialize the ingestion checkpoint without importing history.
 */
export async function getNewestWazuhAlertTimestamp(): Promise<Date | null> {
  const result = await indexerRequest<{
    hits?: { hits?: Array<{ _source?: { timestamp?: string } }> };
  }>("POST", "/wazuh-alerts-*/_search", {
    size: 1,
    sort: [{ timestamp: "desc" }],
    _source: ["timestamp"],
    query: { match_all: {} },
  });

  const ts = result.hits?.hits?.[0]?._source?.timestamp;
  if (!ts) return null;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Least-privilege Wazuh service account TODO — currently uses configured Indexer user (GET/search only). */
export const WAZUH_INDEXER_PERMISSIONS_NOTE =
  "Least-privilege Wazuh service account TODO. ClientShield performs GET/search only.";
