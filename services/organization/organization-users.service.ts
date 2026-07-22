import { prisma } from "@/lib/db";
import type { OrganizationUserListItem } from "@/types/client-onboarding";

/**
 * Lists users that belong to the organization (tenant).
 * Never returns users from other organizations.
 *
 * Invitations: stub only — do NOT send invitation emails from this service.
 * Future: create pending User / invite token and deliver via a dedicated mailer.
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
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));
}

/**
 * Invitation stub — intentionally does not send email or create portal access.
 * Callers should gate on ADMIN and implement token + mailer separately.
 */
export async function inviteOrganizationUserStub(
  organizationId: string,
  _input: { email: string; name?: string; role?: string }
): Promise<{ accepted: false; message: string }> {
  void organizationId;
  return {
    accepted: false,
    message:
      "User invitations are not implemented. Add the user via your identity provider, then ensure they exist in this organization. No invitation email was sent.",
  };
}
