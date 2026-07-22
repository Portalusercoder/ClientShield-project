/**
 * Observable normalization helpers for investigation / threat-intel pipelines.
 * Never throw for malformed input — return null so callers can skip safely.
 */

const WEAK_PROCESSES = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "fish",
  "cmd.exe",
  "cmd",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "systemd",
  "launchd",
  "chrome",
  "chrome.exe",
  "google chrome",
  "firefox",
  "firefox.exe",
  "safari",
  "edge",
  "msedge.exe",
  "explorer.exe",
  "svchost.exe",
  "init",
  "kernel_task",
  "WindowServer",
  "dock",
  "finder",
].map((p) => p.toLowerCase()));

const SECRET_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /bearer\s+[a-z0-9._\-]+/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
  /sk_live_[a-zA-Z0-9]+/,
  /AKIA[0-9A-Z]{16}/,
];

export function looksLikeSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length > 512) return true;
  return SECRET_PATTERNS.some((re) => re.test(v));
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;

  // IPv4
  if (normalized.includes(".")) {
    const parts = normalized.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6
  if (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  ) {
    return true;
  }
  // Mapped private IPv4
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrLocalIp(mapped[1]);
  return false;
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  let v = value.trim().toLowerCase();
  // Strip brackets from IPv6 literals
  if (v.startsWith("[") && v.endsWith("]")) {
    v = v.slice(1, -1);
  }
  // Strip zone id
  const zoneIdx = v.indexOf("%");
  if (zoneIdx >= 0) v = v.slice(0, zoneIdx);

  // IPv4
  const ipv4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return octets.join(".");
    }
    return null;
  }

  // Basic IPv6 (contains :)
  if (v.includes(":")) {
    // Collapse and validate roughly
    if (!/^[0-9a-f:]+$/.test(v.replace(/\./g, ""))) {
      // may be IPv4-mapped
      if (!/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(v) && !/^[0-9a-f:.]+$/.test(v)) {
        return null;
      }
    }
    try {
      // Expand :: for a stable normalized form (lowercase already)
      return compressIpv6(v);
    } catch {
      return null;
    }
  }

  return null;
}

function compressIpv6(ip: string): string | null {
  // Prefer Node URL parsing for validation when possible
  try {
    // For IPv4-mapped keep as-is lowercase
    if (ip.startsWith("::ffff:")) return ip;
    const parts = ip.split("::");
    if (parts.length > 2) return null;
    let head = parts[0] ? parts[0].split(":").filter(Boolean) : [];
    let tail = parts[1] ? parts[1].split(":").filter(Boolean) : [];
    if (parts.length === 1) {
      const all = ip.split(":");
      if (all.length !== 8) return null;
      return all.map((h) => h.replace(/^0+/, "") || "0").join(":");
    }
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    const full = [
      ...head,
      ...Array(missing).fill("0"),
      ...tail,
    ].map((h) => h.replace(/^0+/, "") || "0");
    // Compress longest zero run for display stability — keep expanded-ish lowercase
    return full.join(":");
  } catch {
    return null;
  }
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  let v = value.trim().toLowerCase();
  // Strip scheme if accidentally included
  v = v.replace(/^https?:\/\//, "");
  v = v.split("/")[0] ?? v;
  v = v.split(":")[0] ?? v;
  v = v.replace(/\.$/, "");
  if (!v || v.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(v)) return null;
  if (!v.includes(".")) {
    // single-label hostnames are OK as hostname, not domain — still accept if looks host-like
    if (!/^[a-z0-9-]+$/.test(v)) return null;
  }
  return v;
}

export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  const v = value.trim();
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Drop fragment; keep pathname + search (sanitized length)
    u.hash = "";
    const out = u.toString();
    if (out.length > 2000) return out.slice(0, 2000);
    return out.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeHash(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  const v = value.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(v)) return null;
  if (v.length !== 32 && v.length !== 40 && v.length !== 64) return null;
  return v;
}

export function normalizeUsername(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  const v = value.trim().toLowerCase();
  if (!v || v.length > 200) return null;
  // Reject values that look like paths or commands
  if (v.includes("/") || v.includes("\\") || v.includes(" ")) return null;
  return v;
}

export function normalizeProcess(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  let v = value.trim();
  // Take basename if path-like
  v = v.replace(/\\/g, "/");
  const parts = v.split("/");
  v = (parts[parts.length - 1] ?? v).trim();
  if (!v || v.length > 300) return null;
  return v.toLowerCase();
}

export function isWeakProcess(normalizedProcess: string): boolean {
  return WEAK_PROCESSES.has(normalizedProcess.toLowerCase());
}

export function normalizeFilePath(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  if (looksLikeSecret(value)) return null;
  let v = value.trim();
  if (!v || v.length > 1000) return null;
  // Normalize separators lightly
  v = v.replace(/\\/g, "/");
  return v;
}

export function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan") ||
    h.endsWith(".corp") ||
    h.endsWith(".home")
  ) {
    return true;
  }
  return false;
}
