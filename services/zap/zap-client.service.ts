import http from "node:http";
import https from "node:https";
import { serverEnv } from "@/lib/env";
import type { ZapRawAlert } from "@/types/zap";
import { ZAP_MAX_ALERTS } from "@/types/zap";

export class ZapClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "API_ERROR"
      | "PARSE_ERROR"
  ) {
    super(message);
    this.name = "ZapClientError";
  }
}

function getBaseUrl(): string {
  return serverEnv.ZAP_API_URL.replace(/\/$/, "");
}

function getApiKey(): string {
  return serverEnv.ZAP_API_KEY;
}

function resolveApiHostHeader(base: URL): string | undefined {
  if (serverEnv.ZAP_API_HOST_HEADER) return serverEnv.ZAP_API_HOST_HEADER;
  // Docker publishes 127.0.0.1:8090 → container :8080. Undici/fetch forbids Host
  // overrides, so we use node:http and set Host to ZAP's internal listen address.
  if (
    base.port === "8090" ||
    (base.hostname === "127.0.0.1" && base.port !== "" && base.port !== "8080")
  ) {
    return "localhost:8080";
  }
  return undefined;
}

/**
 * Uses node:http (not fetch) so the Host header can be set for Docker port NAT.
 * IMPORTANT: never call Active Scan (ascan) endpoints from this client.
 */
async function zapFetch(
  path: string,
  params: Record<string, string> = {},
  options: { timeoutMs?: number } = {}
): Promise<unknown> {
  const url = new URL(`${getBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", getApiKey());

  const timeoutMs = options.timeoutMs ?? 30_000;
  const hostHeader = resolveApiHostHeader(url);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-ZAP-API-Key": getApiKey(),
          ...(hostHeader ? { Host: hostHeader } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new ZapClientError(
                `ZAP API returned HTTP ${res.statusCode}`,
                "API_ERROR"
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as unknown);
          } catch {
            reject(
              new ZapClientError(
                "Failed to parse ZAP API response",
                "PARSE_ERROR"
              )
            );
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new ZapClientError("ZAP API request timed out", "TIMEOUT"));
    });

    req.on("error", () => {
      reject(
        new ZapClientError(
          "OWASP ZAP is unavailable. Confirm the clientshield-zap Docker service is running.",
          "UNAVAILABLE"
        )
      );
    });

    req.end();
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Low-level ZAP JSON API client.
 * IMPORTANT: This client must never call Active Scan (ascan) endpoints.
 */
export async function getZapVersion(): Promise<string> {
  const data = asRecord(await zapFetch("/JSON/core/view/version/"));
  return String(data.version ?? "unknown");
}

export async function pingZap(): Promise<boolean> {
  try {
    await getZapVersion();
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a fresh ZAP session so prior scan state does not leak between assets.
 */
export async function newZapSession(name: string): Promise<void> {
  await zapFetch("/JSON/core/action/newSession/", {
    name,
    overwrite: "true",
  });
}

/**
 * Seeds the site tree by accessing the target URL (passive observation only).
 */
export async function accessUrl(url: string): Promise<void> {
  await zapFetch("/JSON/core/action/accessUrl/", {
    url,
    followRedirects: "true",
  });
}

/**
 * Starts the traditional spider only. Never starts Active Scan.
 */
export async function startSpider(input: {
  url: string;
  maxDurationMinutes: number;
}): Promise<string> {
  // Limit spider duration (minutes) via spider option before starting
  await zapFetch("/JSON/spider/action/setOptionMaxDuration/", {
    Integer: String(input.maxDurationMinutes),
  });

  const data = asRecord(
    await zapFetch("/JSON/spider/action/scan/", {
      url: input.url,
      maxChildren: "0",
      recurse: "true",
      subtreeOnly: "false",
    })
  );

  const scanId = String(data.scan ?? "");
  if (!scanId) {
    throw new ZapClientError("ZAP spider did not return a scan id", "API_ERROR");
  }
  return scanId;
}

export async function getSpiderStatus(scanId: string): Promise<number> {
  const data = asRecord(
    await zapFetch("/JSON/spider/view/status/", { scanId })
  );
  const status = Number(data.status ?? 0);
  return Number.isFinite(status) ? status : 0;
}

export async function getPassiveScanRecordsRemaining(): Promise<number> {
  const data = asRecord(await zapFetch("/JSON/pscan/view/recordsToScan/"));
  const remaining = Number(data.recordsToScan ?? 0);
  return Number.isFinite(remaining) ? remaining : 0;
}

/**
 * Fetches alerts raised during spidering / passive analysis.
 * Does not include Active Scan results (Active Scan is never invoked).
 */
export async function getAlerts(baseurl: string): Promise<ZapRawAlert[]> {
  const alerts: ZapRawAlert[] = [];
  const pageSize = 100;
  let start = 0;

  while (alerts.length < ZAP_MAX_ALERTS) {
    const data = asRecord(
      await zapFetch("/JSON/alert/view/alerts/", {
        baseurl,
        start: String(start),
        count: String(pageSize),
      })
    );

    const batch = Array.isArray(data.alerts)
      ? (data.alerts as ZapRawAlert[])
      : [];

    if (batch.length === 0) break;
    alerts.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }

  return alerts.slice(0, ZAP_MAX_ALERTS);
}

/**
 * Soft-stop spider if still running when timeout approaches.
 */
export async function stopSpider(scanId: string): Promise<void> {
  try {
    await zapFetch("/JSON/spider/action/stop/", { scanId });
  } catch {
    // Best-effort stop
  }
}

export async function waitForSpiderAndPassive(input: {
  spiderId: string;
  timeoutMs: number;
  pollIntervalMs?: number;
}): Promise<{ spiderComplete: boolean; passiveComplete: boolean }> {
  const poll = input.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + input.timeoutMs;
  let spiderComplete = false;
  let passiveComplete = false;

  while (Date.now() < deadline) {
    if (!spiderComplete) {
      const status = await getSpiderStatus(input.spiderId);
      if (status >= 100) spiderComplete = true;
    }

    if (spiderComplete) {
      const remaining = await getPassiveScanRecordsRemaining();
      if (remaining <= 0) {
        passiveComplete = true;
        break;
      }
    }

    await new Promise((r) => setTimeout(r, poll));
  }

  if (!spiderComplete) {
    await stopSpider(input.spiderId);
  }

  return { spiderComplete, passiveComplete };
}
