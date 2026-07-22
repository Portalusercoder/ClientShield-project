import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { listOrganizationUsers } from "@/services/organization/organization-users.service";

export const metadata: Metadata = {
  title: "Organization Users",
};

export const dynamic = "force-dynamic";

export default async function OrganizationUsersPage() {
  const session = await requireSession();
  const users = await listOrganizationUsers(session.organizationId);

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
          Users authenticated into this ClientShield organization tenant.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invitations will be available after production authentication is
            configured. No invitation emails are sent from this development
            environment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted">
              No users found for this organization.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 font-medium text-muted">Name</th>
                    <th className="px-4 py-3 font-medium text-muted">Email</th>
                    <th className="px-4 py-3 font-medium text-muted">Role</th>
                    <th className="px-4 py-3 font-medium text-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3">{user.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{user.email}</td>
                      <td className="px-4 py-3">{user.role}</td>
                      <td className="px-4 py-3 text-muted">Active</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
