import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityLink } from "@/components/ui/entity-link";
import { formatRelativeTime } from "@/lib/utils";
import type { ExecutiveClientOverviewRow } from "@/types/executive-dashboard";

export function ExecutiveClientSection({
  clients,
}: {
  clients: ExecutiveClientOverviewRow[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Client Overview</h2>
        <p className="text-sm text-muted">
          Top 10 clients by stored security posture (lowest first).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
          <CardDescription>
            Assets, open work, posture, and last activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <EmptyState
              title="No clients"
              description="Client posture summaries appear after onboarding."
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="px-2 py-2 font-medium">Client</th>
                    <th className="px-2 py-2 font-medium">Assets</th>
                    <th className="px-2 py-2 font-medium">Incidents</th>
                    <th className="px-2 py-2 font-medium">Findings</th>
                    <th className="px-2 py-2 font-medium">Investigations</th>
                    <th className="px-2 py-2 font-medium">Posture</th>
                    <th className="px-2 py-2 font-medium">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td className="px-2 py-2">
                        <EntityLink href={`/clients/${c.id}`}>{c.name}</EntityLink>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{c.assets}</td>
                      <td className="px-2 py-2 tabular-nums">{c.openIncidents}</td>
                      <td className="px-2 py-2 tabular-nums">{c.openFindings}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {c.openInvestigations}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {c.securityPosture ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-muted whitespace-nowrap">
                        {c.lastActivityAt
                          ? formatRelativeTime(c.lastActivityAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
