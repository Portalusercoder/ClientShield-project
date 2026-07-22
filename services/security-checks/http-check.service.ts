import http from "node:http";
import https from "node:https";
import type { HttpsCheckResult } from "@/types/security-check";
import {
  NETWORK_SAFETY,
  assertSafeRedirectUrl,
  assertSafeUrl,
} from "@/services/security-checks/network-safety.service";

interface FetchHeadersResult {
  finalUrl: string;
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  responseTimeMs: number;
  redirectedToHttps: boolean;
}

function requestOnce(
  url: URL,
  method: "HEAD" | "GET"
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  socket: import("node:net").Socket | import("node:tls").TLSSocket | null;
}> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method,
        timeout: NETWORK_SAFETY.REQUEST_TIMEOUT_MS,
        headers: {
          "User-Agent": "ClientShield-PassiveCheck/1.0",
          Accept: "*/*",
        },
        // Do not disable TLS validation.
        rejectUnauthorized: true,
      },
      (res) => {
        // Drain / abort body early — we only need headers for most checks.
        res.on("data", () => {
          /* intentionally discard */
        });
        res.resume();
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          socket: res.socket,
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Performs a safe HEAD/GET against an authorized URL with SSRF-safe redirects.
 * Does not download large response bodies.
 */
export async function fetchSafeHeaders(
  startUrl: string
): Promise<FetchHeadersResult> {
  let current = await assertSafeUrl(startUrl);
  let redirectedToHttps = false;
  const started = Date.now();

  for (let i = 0; i <= NETWORK_SAFETY.MAX_REDIRECTS; i++) {
    let response: Awaited<ReturnType<typeof requestOnce>>;
    try {
      response = await requestOnce(current, "HEAD");
      // Some servers reject HEAD — fall back to GET once.
      if (response.statusCode === 405 || response.statusCode === 501) {
        response = await requestOnce(current, "GET");
      }
    } catch (error) {
      if (i === 0 && current.protocol === "https:") {
        throw error;
      }
      throw error;
    }

    const { statusCode, headers } = response;
    const location = headers.location;

    if (
      statusCode >= 300 &&
      statusCode < 400 &&
      typeof location === "string" &&
      location.length > 0
    ) {
      if (i === NETWORK_SAFETY.MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const nextUrl = new URL(location, current);
      await assertSafeRedirectUrl(nextUrl.toString());

      if (current.protocol === "http:" && nextUrl.protocol === "https:") {
        redirectedToHttps = true;
      }

      current = nextUrl;
      continue;
    }

    return {
      finalUrl: current.toString(),
      statusCode,
      headers,
      responseTimeMs: Date.now() - started,
      redirectedToHttps,
    };
  }

  throw new Error("Too many redirects");
}

export async function checkHttpsAvailability(
  assetUrl: string
): Promise<HttpsCheckResult> {
  try {
    const parsed = await assertSafeUrl(assetUrl);
    const httpsUrl =
      parsed.protocol === "https:"
        ? parsed.toString()
        : `https://${parsed.host}${parsed.pathname}${parsed.search}`;

    let httpRedirectsToHttps: boolean | null = null;

    if (parsed.protocol === "http:") {
      try {
        const httpResult = await fetchSafeHeaders(parsed.toString());
        httpRedirectsToHttps =
          httpResult.redirectedToHttps ||
          (httpResult.finalUrl.startsWith("https://") ?? false);
      } catch {
        httpRedirectsToHttps = false;
      }
    }

    const result = await fetchSafeHeaders(httpsUrl);

    return {
      reachable: true,
      statusCode: result.statusCode,
      finalUrl: result.finalUrl,
      responseTimeMs: result.responseTimeMs,
      httpRedirectsToHttps,
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      statusCode: null,
      finalUrl: null,
      responseTimeMs: null,
      httpRedirectsToHttps: null,
      error: error instanceof Error ? error.message : "HTTPS check failed",
    };
  }
}

export { fetchSafeHeaders as fetchAuthorizedAssetHeaders };
