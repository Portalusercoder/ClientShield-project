import Link from "next/link";
import { formatPercent, formatRelativeTime } from "@/lib/utils";
import type {
  DashboardActivity,
  DashboardClientAttention,
  DashboardFinding,
  DashboardRemediationMetric,
} from "@/types/dashboard";
import type { DashboardIncident } from "@/types/incidents";
import type { DashboardSecurityEvent } from "@/types/security-events";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";

export function ClientsAttentionList({
  clients,
}: {
  clients: DashboardClientAttention[];
}) {
  return (
    <ul className="divide-y divide-border">
      {clients.map((client) => (
        <li
          key={client.id}
          className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{client.name}</p>
            <p className="text-xs text-muted">
              {client.criticalFindings} critical · {client.openIncidents} incidents
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-sm font-semibold tabular-nums ${
                client.securityScore < 60
                  ? "text-severity-critical"
                  : client.securityScore < 75
                    ? "text-severity-high"
                    : "text-foreground"
              }`}
            >
              {client.securityScore}
            </p>
            <p className="text-xs text-muted">Score</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RecentFindingsList({
  findings,
}: {
  findings: DashboardFinding[];
}) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted">
        No unresolved findings yet. Run a passive security check to populate
        this list.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {findings.map((finding) => (
        <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/vulnerabilities/${finding.id}`}
                className="truncate text-sm font-medium text-foreground hover:text-accent"
              >
                {finding.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {finding.clientName} · {finding.assetName}
                {(finding.instanceCount ?? 0) > 0
                  ? ` · ${finding.instanceCount} locations`
                  : ""}
              </p>
            </div>
            <SeverityBadge severity={finding.severity} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {formatRelativeTime(finding.detectedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RecentIncidentsList({
  incidents,
}: {
  incidents: DashboardIncident[];
}) {
  if (incidents.length === 0) {
    return (
      <p className="text-sm text-muted">
        No incidents yet. Create an incident from the Incidents page when
        response coordination is required.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {incidents.map((incident) => (
        <li key={incident.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/incidents/${incident.id}`}
                className="truncate text-sm font-medium text-foreground hover:text-accent"
              >
                {incident.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {incident.clientName}
                {" · "}
                {incident.assignedToName ?? "Unassigned"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <IncidentSeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">
            {formatRelativeTime(incident.detectedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RecentSecurityEventsList({
  events,
}: {
  events: DashboardSecurityEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">
        No security events yet. Run a controlled Wazuh sync from the
        integration page when ready.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/security-events/${event.id}`}
                className="truncate text-sm font-medium text-foreground hover:text-accent"
              >
                {event.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {event.clientName} · {event.occurrenceCount} occurrence
                {event.occurrenceCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <SecurityEventSeverityBadge severity={event.severity} />
              <SecurityEventStatusBadge status={event.status} />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">
            {formatRelativeTime(event.lastSeenAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RecentActivityList({
  activities,
}: {
  activities: DashboardActivity[];
}) {
  return (
    <ul className="space-y-3">
      {activities.map((activity) => (
        <li key={activity.id} className="flex gap-3">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {activity.action}
            </p>
            <p className="text-xs text-muted">{activity.description}</p>
            <p className="mt-0.5 text-xs text-muted">
              {activity.actor} · {formatRelativeTime(activity.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RemediationPerformance({
  metrics,
}: {
  metrics: DashboardRemediationMetric;
}) {
  const items = [
    { label: "Open Tasks", value: metrics.openTasks },
    { label: "In Progress", value: metrics.inProgress },
    { label: "Completed (Month)", value: metrics.completedThisMonth },
    { label: "Overdue", value: metrics.overdueTasks, highlight: true },
    {
      label: "Avg Resolution",
      value: `${metrics.averageResolutionDays}d`,
    },
    {
      label: "Completion Rate",
      value: formatPercent(metrics.completionRate),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd
            className={`mt-1 text-lg font-semibold tabular-nums ${
              item.highlight ? "text-severity-high" : "text-foreground"
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
