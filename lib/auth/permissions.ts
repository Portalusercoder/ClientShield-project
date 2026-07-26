import type { UserRole } from "@prisma/client";
import type { AuthSession } from "@/lib/auth/types";
import { logSecurityEvent } from "@/lib/security/security-log";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 1,
  ANALYST: 2,
  ADMIN: 3,
  OWNER: 4,
};

/**
 * Checks whether a session role meets the minimum required role.
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
    logSecurityEvent({
      type: "authz_failed",
      severity: "warn",
      message: "Role check failed",
      meta: {
        userId: session.userId,
        organizationId: session.organizationId,
        role: session.role,
        required: minimumRole,
      },
    });
    throw new Error("Forbidden");
  }
}

/**
 * Validates that a resource belongs to the session's organization.
 * Use when loading resources by ID to enforce tenant isolation.
 */
export function assertOrganizationAccess(
  session: AuthSession,
  resourceOrganizationId: string
): void {
  if (session.organizationId !== resourceOrganizationId) {
    logSecurityEvent({
      type: "authz_failed",
      severity: "warn",
      message: "Organization scope mismatch",
      meta: {
        userId: session.userId,
        organizationId: session.organizationId,
        resourceOrganizationId,
      },
    });
    throw new Error("Forbidden: organization mismatch");
  }
}
