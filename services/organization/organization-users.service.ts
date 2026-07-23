import { prisma } from "@/lib/db";
import type { OrganizationUserListItem } from "@/types/client-onboarding";

/**
 * Lists users that belong to the organization (tenant).
 * Never returns users from other organizations.
 *
 * Full invitation emails are deferred — use createOrganizationUser + linkUserExternalId.
 */
export async function listOrganizationUsers(
  organizationId: string
): Promise<OrganizationUserListItem[]> {
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      externalId: true,
      disabledAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    externalId: u.externalId,
    disabledAt: u.disabledAt,
    lastLoginAt: u.lastLoginAt,
    status: u.disabledAt ? "DISABLED" : "ACTIVE",
  }));
}

/**
 * @deprecated Invitation emails remain unimplemented.
 * Prefer createOrganizationUserAction + linkUserExternalIdAction.
 */
export async function inviteOrganizationUserStub(
  organizationId: string,
  _input: { email: string; name?: string; role?: string }
): Promise<{ accepted: false; message: string }> {
  void organizationId;
  return {
    accepted: false,
    message:
      "User invitation emails are not implemented. Create the user in Settings → Users, then link their IdP externalId. No invitation email was sent.",
  };
}
