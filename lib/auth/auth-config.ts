/**
 * Authentication environment helpers (Phase 5).
 *
 * Production MUST fail closed when Auth0/Auth.js is misconfigured.
 * AUTH_DEV_BYPASS is local-only: development Node, or local App URL when Edge
 * middleware inlines NODE_ENV=production under `next dev`.
 */
import { z } from "zod";

export type AuthRuntimeMode = "dev_bypass" | "auth0" | "misconfigured";

function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function isDevelopmentNodeEnv(): boolean {
  return process.env.NODE_ENV === "development";
}

/** True when NEXT_PUBLIC_APP_URL points at a local loopback host. */
export function isLocalAppUrl(): boolean {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().toLowerCase();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return (
      raw.includes("://localhost") ||
      raw.includes("://127.0.0.1") ||
      raw.includes("://[::1]")
    );
  }
}

/**
 * Explicit local-only bypass.
 * Never honored for non-local production deployments.
 *
 * Edge middleware may see NODE_ENV=production even under `next dev` (bundler
 * inline). Allow bypass when AUTH_DEV_BYPASS=true and App URL is local.
 */
export function isAuthDevBypassEnabled(): boolean {
  if (process.env.AUTH_DEV_BYPASS !== "true") return false;

  if (isDevelopmentNodeEnv()) return true;

  // Edge/`next start` may report production — only allow on local App URL.
  // Real production hosts must not set AUTH_DEV_BYPASS (startup also refuses).
  if (isProductionNodeEnv() && isLocalAppUrl()) return true;

  return false;
}

export function getAuthSecret(): string | undefined {
  return process.env.AUTH_SECRET?.trim() || undefined;
}

export function getAuth0Config(): {
  clientId: string;
  clientSecret: string;
  issuer: string;
} | null {
  const clientId = process.env.AUTH0_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_CLIENT_SECRET?.trim();
  const issuer = process.env.AUTH0_ISSUER?.trim();
  if (!clientId || !clientSecret || !issuer) return null;
  return { clientId, clientSecret, issuer };
}

/**
 * Resolve how authentication should behave for this process.
 * - production + incomplete Auth0/AUTH_SECRET → misconfigured (fail closed)
 * - development + AUTH_DEV_BYPASS=true → dev_bypass
 * - Auth0 fully configured → auth0
 * - otherwise → misconfigured
 */
export function resolveAuthRuntimeMode(): AuthRuntimeMode {
  if (isAuthDevBypassEnabled()) {
    return "dev_bypass";
  }

  const secret = getAuthSecret();
  const auth0 = getAuth0Config();
  const provider = (process.env.AUTH_PROVIDER ?? "").trim().toLowerCase();

  if (secret && auth0 && (provider === "auth0" || provider === "")) {
    return "auth0";
  }

  return "misconfigured";
}

export function assertProductionAuthConfigured(): void {
  if (!isProductionNodeEnv()) return;
  if (process.env.AUTH_DEV_BYPASS === "true") {
    throw new Error(
      "AUTH_DEV_BYPASS is set but NODE_ENV=production — refused (fail closed)"
    );
  }
  if (resolveAuthRuntimeMode() !== "auth0") {
    throw new Error(
      "Production authentication is misconfigured. Set AUTH_SECRET, AUTH_PROVIDER=auth0, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_ISSUER."
    );
  }
}

/** Safe relative returnTo paths only. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  if (trimmed.includes("://")) return "/";
  if (trimmed.includes("\\")) return "/";
  if (trimmed.includes("\n") || trimmed.includes("\r")) return "/";
  return trimmed.slice(0, 512);
}

export const createOrganizationUserSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().max(200).optional().nullable(),
  role: z.enum(["VIEWER", "ANALYST", "ADMIN", "OWNER"]),
});

export const linkExternalIdSchema = z.object({
  userId: z.string().min(1).max(64),
  externalId: z.string().trim().min(1).max(256),
});
