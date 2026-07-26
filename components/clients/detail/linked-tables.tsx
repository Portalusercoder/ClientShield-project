import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityLink } from "@/components/ui/entity-link";
import { formatDate } from "@/lib/utils";
import type { FindingListItem } from "@/types/findings";
import type {
  ClientIncidentItem,
  ClientInvestigationItem,
  ClientReportItem,
  ClientSecurityEventItem,
} from "./types";

export function FindingsTab({ findings }: { findings: FindingListItem[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState title="No findings" description="No findings for this client yet." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Finding</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((f) => (
            <tr key={f.id}>
              <td className="px-4 py-3">
                <EntityLink href={`/vulnerabilities/${f.id}`}>{f.title}</EntityLink>
              </td>
              <td className="px-4 py-3">{f.severity}</td>
              <td className="px-4 py-3">{f.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SecurityEventsTab({
  securityEvents,
}: {
  securityEvents: ClientSecurityEventItem[];
}) {
  if (securityEvents.length === 0) {
    return (
      <EmptyState title="No security events" description="No events linked to this client." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Event</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="px-4 py-3 font-medium text-muted">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {securityEvents.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3">
                <EntityLink href={`/security-events/${e.id}`}>{e.title}</EntityLink>
              </td>
              <td className="px-4 py-3">
                <SecurityEventSeverityBadge severity={e.severity} />
              </td>
              <td className="px-4 py-3">
                <SecurityEventStatusBadge status={e.status as never} />
              </td>
              <td className="px-4 py-3 text-muted">{formatDate(e.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvestigationsTab({
  investigations,
}: {
  investigations: ClientInvestigationItem[];
}) {
  if (investigations.length === 0) {
    return (
      <EmptyState title="No investigations" description="No investigation groups for this client." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Investigation</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="px-4 py-3 font-medium text-muted">Source</th>
            <th className="px-4 py-3 font-medium text-muted">Events</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {investigations.map((inv) => (
            <tr key={inv.id}>
              <td className="px-4 py-3">
                <EntityLink href={`/investigations/${inv.id}`}>{inv.title}</EntityLink>
              </td>
              <td className="px-4 py-3">{inv.status}</td>
              <td className="px-4 py-3">{inv.createdByType}</td>
              <td className="px-4 py-3 tabular-nums">{inv.eventCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncidentsTab({
  incidents,
}: {
  incidents: ClientIncidentItem[];
}) {
  if (incidents.length === 0) {
    return (
      <EmptyState title="No incidents" description="No incidents for this client." />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Incident</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="px-4 py-3 font-medium text-muted">Detected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {incidents.map((inc) => (
            <tr key={inc.id}>
              <td className="px-4 py-3">
                <EntityLink href={`/incidents/${inc.id}`}>{inc.title}</EntityLink>
              </td>
              <td className="px-4 py-3">
                <IncidentSeverityBadge severity={inc.severity} />
              </td>
              <td className="px-4 py-3">
                <IncidentStatusBadge status={inc.status as never} />
              </td>
              <td className="px-4 py-3 text-muted">{formatDate(inc.detectedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsTab({ reports }: { reports: ClientReportItem[] }) {
  if (reports.length === 0) {
    return (
      <EmptyState title="No reports" description="Reports for this client will appear here." />
    );
  }
  return (
    <ul className="space-y-2">
      {reports.map((r) => (
        <li key={r.id} className="rounded-md border border-border px-4 py-3 text-sm">
          <EntityLink href={`/reports/${r.id}`} className="font-medium hover:text-accent">
            {r.title}
          </EntityLink>
          <p className="text-muted">{formatDate(r.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
