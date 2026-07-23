import type { UserRole } from "@prisma/client";

/**
 * Authenticated ClientShield session.
 * organizationId and role are ALWAYS sourced from the Prisma User row.
 */
export interface AuthSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string | null;
  role: UserRole;
  externalId: string | null;
}

export type AuthProvider = "none" | "auth0" | "clerk" | "azure-ad" | "oidc";

export interface AuthConfig {
  provider: AuthProvider;
  secret?: string;
}

/**
 * @deprecated Prefer resolveAuthRuntimeMode() from auth-config.
 * Kept for compatibility with older imports.
 */
export function getAuthConfig(): AuthConfig {
  return {
    provider: (process.env.AUTH_PROVIDER as AuthProvider) ?? "none",
    secret: process.env.AUTH_SECRET,
  };
}
