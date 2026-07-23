import type { Metadata } from "next";
import Link from "next/link";
import { UsersAdminClient } from "@/components/settings/users-admin-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listOrganizationUsers } from "@/services/organization/organization-users.service";

export const metadata: Metadata = {
  title: "Organization Users",
};

export const dynamic = "force-dynamic";

export default async function OrganizationUsersPage() {
  const session = await requireSession();
  const users = await listOrganizationUsers(session.organizationId);
  const canManage = hasMinimumRole(session, "ADMIN");
  const canCreateOwner = hasMinimumRole(session, "OWNER");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/settings" className="hover:text-accent">
            ← Settings
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Organization users
        </h1>
        <p className="mt-1 text-sm text-muted">
          Provision users locally, then link their Auth0 subject (`sub`) before
          first login. Invitation emails are not sent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Authorization (organization and role) always comes from this
            ClientShield directory — not from IdP claims.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersAdminClient
            users={users}
            canManage={canManage}
            canCreateOwner={canCreateOwner}
          />
        </CardContent>
      </Card>
    </div>
  );
}
