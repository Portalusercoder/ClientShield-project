import type { UserRole } from "@prisma/client";
import {
  assertMinimumRole,
  requireSession,
  type AuthSession,
} from "@/lib/auth";

/**
 * Standard server-action gate: authenticated session + minimum role.
 * Organization is always taken from the session (never from client input).
 */
export async function requireActionSession(
  minimumRole: UserRole = "ANALYST"
): Promise<AuthSession> {
  const session = await requireSession();
  assertMinimumRole(session, minimumRole);
  return session;
}
