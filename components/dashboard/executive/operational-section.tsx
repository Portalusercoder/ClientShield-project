import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  AnalystWorkloadRow,
  ExecutiveOperationalOverview,
} from "@/types/executive-dashboard";

function WorkloadTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: AnalystWorkloadRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No assignments"
            description="Assigned open work will appear here."
            className="py-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Analyst</th>
                  <th className="px-2 py-2 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2 tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutiveOperationalSection({
  operational,
}: {
  operational: ExecutiveOperationalOverview;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Operational Overview
        </h2>
        <p className="text-sm text-muted">
          Workload distribution and queue volume across the organization.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attention Queue Size"
          value={operational.attentionQueueSize}
          variant="warning"
        />
        <StatCard
          label="Notifications (7d)"
          value={operational.notificationVolume7d}
        />
        <StatCard
          label="Notifications (30d)"
          value={operational.notificationVolume30d}
        />
        <StatCard
          label="Avg Analyst Workload"
          value={
            operational.averageAnalystWorkload == null
              ? "N/A"
              : operational.averageAnalystWorkload
          }
        />
        <StatCard
          label="Investigation Backlog"
          value={operational.investigationBacklog}
          variant="high"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <WorkloadTable
          title="Open Investigations by Analyst"
          description="Active investigation assignees"
          rows={operational.openInvestigationsByAnalyst}
        />
        <WorkloadTable
          title="Open Incidents by Analyst"
          description="Open incident assignees"
          rows={operational.openIncidentsByAnalyst}
        />
      </div>
    </section>
  );
}
