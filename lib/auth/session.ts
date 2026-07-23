import type { AuthSession } from "@/lib/auth/types";
import {
  resolveAuthRuntimeMode,
  assertProductionAuthConfigured,
} from "@/lib/auth/auth-config";
import { loadDevBypassUser, resolveUserByExternalId, toAuthSession } from "@/lib/auth/identity-mapping";
import { DEV_USER_ID } from "@/lib/dev-constants";

/**
 * Resolves the current authenticated ClientShield session.
 *
 * - development + AUTH_DEV_BYPASS=true → DB user DEV_USER_ID (role from DB)
 * - Auth0 mode → Auth.js session subject → User.externalId lookup
 * - production misconfigured → fail closed
 *
 * organizationId and role ALWAYS come from Prisma User — never from client input or IdP claims.
 */
export async function getSession(): Promise<AuthSession | null> {
  const mode = resolveAuthRuntimeMode();

  if (process.env.NODE_ENV === "production") {
    try {
      assertProductionAuthConfigured();
    } catch {
      return null;
    }
  }

  if (mode === "misconfigured") {
    return null;
  }

  if (mode === "dev_bypass") {
    try {
      return await loadDevBypassUser({ userId: DEV_USER_ID });
    } catch {
      return null;
    }
  }

  // auth0 mode
  try {
    const { auth } = await import("@/auth");
    const nextAuthSession = await auth();
    const subject =
      (nextAuthSession?.user as { id?: string } | undefined)?.id ??
      nextAuthSession?.user?.email;
    // Prefer id (IdP sub). Never map by email for authorization.
    const externalId = (nextAuthSession?.user as { id?: string } | undefined)?.id;
    if (!externalId) {
      return null;
    }
    void subject;
    const user = await resolveUserByExternalId(externalId);
    return toAuthSession(user);
  } catch {
    return null;
  }
}

/**
 * Requires an authenticated session or throws Unauthorized.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

/**
 * Resolves the tenant organization ID from the authenticated session.
 * Server-side tenant isolation must always use this — never client input.
 */
export async function getOrganizationId(): Promise<string> {
  const session = await requireSession();
  return session.organizationId;
}
