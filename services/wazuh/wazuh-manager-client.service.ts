import https from "node:https";
import { URL } from "node:url";
import { serverEnv } from "@/lib/env";
import { createWazuhTlsAgent } from "@/lib/wazuh/tls";

export interface WazuhAgentInfo {
  id: string;
  name: string;
  status: string;
  ip: string | null;
  os: string | null;
  version: string | null;
  lastKeepAlive: string | null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function assertWazuhEnabled(): void {
  if (!serverEnv.WAZUH_ENABLED) {
    throw new Error("Wazuh integration is disabled (WAZUH_ENABLED=false)");
  }
}

async function managerRequest(
  method: string,
  path: string,
  options?: { token?: string; basicAuth?: boolean; body?: unknown }
): Promise<{ status: number; json: unknown; text: string }> {
  assertWazuhEnabled();
  const base = serverEnv.WAZUH_MANAGER_API_URL;
  if (!base) throw new Error("WAZUH_MANAGER_API_URL is not configured");

  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  const agent = createWazuhTlsAgent(
    serverEnv.WAZUH_MANAGER_TLS_SERVERNAME,
    serverEnv.WAZUH_MANAGER_CA_CERT_PATH || serverEnv.WAZUH_CA_CERT_PATH
  );
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options?.basicAuth) {
    if (
      !serverEnv.WAZUH_MANAGER_API_USERNAME ||
      !serverEnv.WAZUH_MANAGER_API_PASSWORD
    ) {
      throw new Error("Wazuh Manager API credentials are not configured");
    }
    headers.Authorization = `Basic ${Buffer.from(
      `${serverEnv.WAZUH_MANAGER_API_USERNAME}:${serverEnv.WAZUH_MANAGER_API_PASSWORD}`
    ).toString("base64")}`;
  } else if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const payload =
    options?.body == null ? undefined : JSON.stringify(options.body);
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(payload));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        agent,
        headers,
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // Authenticate?raw=true returns a plain JWT string
            json = text;
          }
          resolve({ status: res.statusCode ?? 500, json, text });
        });
      }
    );
    req.on("error", (err) =>
      reject(new Error(`Wazuh Manager API unreachable: ${err.message}`))
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Wazuh Manager API request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getManagerToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const res = await managerRequest(
    "POST",
    "/security/user/authenticate?raw=true",
    { basicAuth: true }
  );
  if (res.status >= 400) {
    throw new Error("Wazuh Manager API authentication failed");
  }

  let token: string | null = null;
  if (typeof res.json === "string" && res.json.trim()) {
    token = res.json.trim();
  } else if (
    res.json &&
    typeof res.json === "object" &&
    "data" in (res.json as object)
  ) {
    token = (res.json as { data?: { token?: string } }).data?.token ?? null;
  } else if (typeof res.text === "string" && res.text.trim().startsWith("eyJ")) {
    token = res.text.trim();
  }

  if (!token) {
    throw new Error("Wazuh Manager API authentication failed");
  }

  cachedToken = {
    token,
    expiresAt: now + 14 * 60 * 1000,
  };
  return token;
}

export async function checkWazuhManagerHealth(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const token = await getManagerToken();
    const res = await managerRequest("GET", "/", { token });
    if (res.status >= 400) {
      return { ok: false, error: "Manager API returned an error" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Manager unavailable",
    };
  }
}

export async function listWazuhAgents(): Promise<WazuhAgentInfo[]> {
  const token = await getManagerToken();
  const res = await managerRequest("GET", "/agents?limit=500&pretty=false", {
    token,
  });
  if (res.status >= 400) {
    throw new Error("Failed to list Wazuh agents");
  }

  const items =
    (
      res.json as {
        data?: {
          affected_items?: Array<Record<string, unknown>>;
        };
      }
    )?.data?.affected_items ?? [];

  return items.map((a) => {
    const os = a.os as { name?: string } | undefined;
    return {
      id: String(a.id ?? ""),
      name: String(a.name ?? ""),
      status: String(a.status ?? "unknown"),
      ip: typeof a.ip === "string" ? a.ip : null,
      os: os?.name ?? null,
      version: typeof a.version === "string" ? a.version : null,
      lastKeepAlive:
        typeof a.lastKeepAlive === "string" ? a.lastKeepAlive : null,
    };
  });
}

/** Clear in-memory JWT cache (tests / logout). Never persisted to DB. */
export function clearWazuhManagerTokenCache(): void {
  cachedToken = null;
}
