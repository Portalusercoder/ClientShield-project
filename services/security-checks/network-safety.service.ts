import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export const NETWORK_SAFETY = {
  MAX_REDIRECTS,
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
} as const;

/**
 * Returns true if an IPv4/IPv6 address is considered unsafe for server-side fetch.
 * Blocks loopback, private, link-local, and cloud metadata ranges.
 */
export function isBlockedIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isBlockedIpAddress(mapped[1]);
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    const [a, b] = parts;

    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(normalized)) {
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast
    if (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host === "metadata.google.internal") return true;
  return false;
}

/**
 * Validates a URL is safe to request from the server (SSRF protection).
 * Resolves DNS and blocks private/local destinations.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https protocols are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  const hostname = parsed.hostname;
  if (!hostname || isBlockedHostname(hostname)) {
    throw new Error("Hostname is not allowed");
  }

  // Literal IP in hostname
  if (net.isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error("Target IP address is not allowed");
    }
    return parsed;
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error("Unable to resolve hostname");
  }

  if (addresses.length === 0) {
    throw new Error("Hostname did not resolve to any addresses");
  }

  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new Error("Resolved IP address is not allowed");
    }
  }

  return parsed;
}

export async function assertSafeRedirectUrl(rawUrl: string): Promise<URL> {
  return assertSafeUrl(rawUrl);
}
