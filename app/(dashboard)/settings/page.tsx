import type { Metadata } from "next";
import Link from "next/link";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { SlaPoliciesSettings } from "@/components/settings/sla-policies-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrganizationSettings } from "@/services/organization/organization-settings.service";
import { listSlaPolicies } from "@/services/sla/sla-policy.service";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const settings = await getOrganizationSettings(session.organizationId);
  const canEdit = hasMinimumRole(session, "ADMIN");
  const [policies, clients] = await Promise.all([
    listSlaPolicies(session.organizationId),
    prisma.client.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const orgDefaults = policies.filter((p) => p.clientId == null);
  const clientOverrides = policies.filter((p) => p.clientId != null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Organization settings, users, and integrations.
        </p>
      </div>

      <OrganizationSettingsForm settings={settings} canEdit={canEdit} />

      <SlaPoliciesSettings
        orgDefaults={orgDefaults}
        clientOverrides={clientOverrides}
        clients={clients}
        canEdit={canEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Organization members and roles (mock authentication in development).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/users"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated hover:text-accent"
          >
            Manage users
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Read-only security telemetry integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/integrations/wazuh"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated hover:text-accent"
          >
            Wazuh Integration
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client portal</CardTitle>
          <CardDescription>
            Future ClientUserAccess mapping will grant explicit portal access.
            Client contacts do not receive login access automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Client portal access is not enabled. Production authentication must
            be configured before invitations or portal roles are activated.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
