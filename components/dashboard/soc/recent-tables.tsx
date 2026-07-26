import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import {
  InvestigationSeverityBadge,
  InvestigationStatusBadge,
} from "@/components/investigations/investigation-badges";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityLink } from "@/components/ui/entity-link";
import { SeverityBadge } from "@/components/ui/badge";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import type {
  FindingDashboardRow,
  IncidentDashboardRow,
  InvestigationDashboardRow,
  SecurityEventDashboardRow,
} from "@/types/soc-dashboard";

export function RecentSecurityEventsTable({
  rows,
}: {
  rows: SecurityEventDashboardRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Security Events</CardTitle>
        <CardDescription>Latest detections for triage</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No security events"
            description="New detections will appear here."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Timestamp</th>
                  <th className="px-2 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Asset</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2 text-muted whitespace-nowrap">
                      {formatRelativeTime(row.timestamp)}
                    </td>
                    <td className="px-2 py-2">
                      <SecurityEventSeverityBadge severity={row.severity} />
                    </td>
                    <td className="px-2 py-2">{row.source}</td>
                    <td className="px-2 py-2">{row.assetName ?? "—"}</td>
                    <td className="px-2 py-2">
                      <SecurityEventStatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-2">
                      <EntityLink href={`/security-events/${row.id}`}>
                        {row.title}
                      </EntityLink>
                    </td>
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

export function RecentInvestigationsTable({
  rows,
}: {
  rows: InvestigationDashboardRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently Updated Investigations</CardTitle>
        <CardDescription>Ordered by last update</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No investigations"
            description="Investigation groups will appear here."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Owner</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">
                      <EntityLink href={`/investigations/${row.id}`}>
                        {row.title}
                      </EntityLink>
                    </td>
                    <td className="px-2 py-2">
                      <InvestigationSeverityBadge severity={row.severity} />
                    </td>
                    <td className="px-2 py-2">{row.ownerName ?? "—"}</td>
                    <td className="px-2 py-2">
                      <InvestigationStatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-2 text-muted whitespace-nowrap">
                      {formatRelativeTime(row.updatedAt)}
                    </td>
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

export function RecentIncidentsTable({
  rows,
}: {
  rows: IncidentDashboardRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Incidents</CardTitle>
        <CardDescription>Latest incident cases</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No incidents"
            description="Incident cases will appear here."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Case</th>
                  <th className="px-2 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Owner</th>
                  <th className="px-2 py-2 font-medium">Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">
                      <EntityLink href={`/incidents/${row.id}`}>
                        <span className="font-medium">{row.caseNumber}</span>
                        <span className="ml-2 text-muted">{row.title}</span>
                      </EntityLink>
                    </td>
                    <td className="px-2 py-2">
                      <IncidentSeverityBadge severity={row.severity} />
                    </td>
                    <td className="px-2 py-2">
                      <IncidentStatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-2">{row.assignedToName ?? "—"}</td>
                    <td className="px-2 py-2 text-muted whitespace-nowrap">
                      {formatRelativeTime(row.detectedAt)}
                    </td>
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

export function RecentFindingsTable({
  rows,
  title = "Recent Findings",
  description = "Unresolved findings by last detection",
}: {
  rows: FindingDashboardRow[];
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No findings"
            description="Vulnerability findings will appear here."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Finding</th>
                  <th className="px-2 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Asset</th>
                  <th className="px-2 py-2 font-medium">Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2">
                      <EntityLink href={`/vulnerabilities/${row.id}`}>
                        {row.title}
                      </EntityLink>
                    </td>
                    <td className="px-2 py-2">
                      <SeverityBadge severity={row.severity} />
                    </td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2">{row.assetName}</td>
                    <td className="px-2 py-2 text-muted whitespace-nowrap">
                      {formatDateTime(row.detectedAt)}
                    </td>
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
