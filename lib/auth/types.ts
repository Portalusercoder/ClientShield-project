import type { UserRole } from "@prisma/client";

/**
 * Authenticated session context.
 * Populated by the identity provider integration layer once auth is wired up.
 */
export interface AuthSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string | null;
  role: UserRole;
  externalId: string | null;
}

export type AuthProvider = "none" | "auth0" | "clerk" | "azure-ad";

export interface AuthConfig {
  provider: AuthProvider;
  secret?: string;
}

/**
 * Resolves auth configuration from environment variables.
 * TODO: Extend when integrating a production identity provider.
 */
export function getAuthConfig(): AuthConfig {
  return {
    provider: (process.env.AUTH_PROVIDER as AuthProvider) ?? "none",
    secret: process.env.AUTH_SECRET,
  };
}
