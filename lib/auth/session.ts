import type { AuthSession } from "@/lib/auth/types";
import { DEV_ORG_ID, DEV_USER_ID } from "@/lib/dev-constants";

/**
 * Resolves the current authenticated session.
 *
 * TODO: Replace mock session with production IdP integration (Auth0, Clerk, Azure AD, etc.).
 * TODO: Validate JWT/session token server-side.
 * TODO: Never trust organizationId from client-supplied headers or query params.
 */
export async function getSession(): Promise<AuthSession | null> {
  // Development placeholder — maps to seeded dev organization and user.
  // Remove before production deployment.
  if (process.env.NODE_ENV === "development") {
    return {
      userId: DEV_USER_ID,
      organizationId: DEV_ORG_ID,
      email: "analyst@clientshield.local",
      name: "Security Analyst",
      role: "ANALYST",
      externalId: null,
    };
  }

  return null;
}

/**
 * Requires an authenticated session or throws.
 *
 * TODO: Enforce authentication on all protected API routes and server actions.
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
