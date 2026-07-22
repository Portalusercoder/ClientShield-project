"use client";

import Link from "next/link";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { formatRelativeTime } from "@/lib/utils";
import type { IncidentListItem } from "@/types/incidents";

export function IncidentsTable({
  incidents,
}: {
  incidents: IncidentListItem[];
}) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
        No incidents match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Case</th>
            <th className="px-4 py-3 font-medium">Incident</th>
            <th className="px-4 py-3 font-medium">Severity</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Phase</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Asset</th>
            <th className="px-4 py-3 font-medium">Lead</th>
            <th className="px-4 py-3 font-medium">Age</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {incidents.map((incident) => (
            <tr key={incident.id} className="hover:bg-surface/40">
              <td className="px-4 py-3">
                <Link
                  href={`/incidents/${incident.id}`}
                  className="font-mono text-xs font-semibold text-accent hover:underline"
                >
                  {incident.caseNumber}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/incidents/${incident.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {incident.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <IncidentSeverityBadge severity={incident.severity} />
              </td>
              <td className="px-4 py-3">
                <IncidentStatusBadge status={incident.status} />
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {incident.currentPhase}
              </td>
              <td className="px-4 py-3 text-muted">{incident.clientName}</td>
              <td className="px-4 py-3 text-muted">
                {incident.assetName ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {incident.leadAnalystName ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatRelativeTime(incident.detectedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
