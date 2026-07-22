import type { UserRole } from "@prisma/client";
import type { AuthSession } from "@/lib/auth/types";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 1,
  ANALYST: 2,
  ADMIN: 3,
  OWNER: 4,
};

/**
 * Checks whether a session role meets the minimum required role.
 *
 * TODO: Enforce authorization on all server actions and API routes.
 * TODO: Add resource-level permission checks (e.g. client-scoped access).
 */
export function hasMinimumRole(
  session: AuthSession,
  minimumRole: UserRole
): boolean {
  return ROLE_HIERARCHY[session.role] >= ROLE_HIERARCHY[minimumRole];
}

export function assertMinimumRole(
  session: AuthSession,
  minimumRole: UserRole
): void {
  if (!hasMinimumRole(session, minimumRole)) {
    throw new Error("Forbidden");
  }
}

/**
 * Validates that a resource belongs to the session's organization.
 * Use when loading resources by ID to enforce tenant isolation.
 *
 * TODO: Apply in all service layer queries before returning data.
 */
export function assertOrganizationAccess(
  session: AuthSession,
  resourceOrganizationId: string
): void {
  if (session.organizationId !== resourceOrganizationId) {
    throw new Error("Forbidden: organization mismatch");
  }
}
