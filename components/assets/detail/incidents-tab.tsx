import Link from "next/link";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { AssetIncidentItem } from "./types";

interface IncidentsTabProps {
  assetId: string;
  incidents: AssetIncidentItem[];
}

export function IncidentsTab({ assetId, incidents }: IncidentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/incidents?assetId=${assetId}`}
          className="text-sm text-accent hover:underline"
        >
          View in Incidents
        </Link>
      </div>
      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents"
          description="No security incidents are linked to this asset."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assigned To</th>
                <th className="px-4 py-3 font-medium">Detected</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((incident) => (
                <tr key={incident.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <IncidentSeverityBadge severity={incident.severity} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {incident.title}
                  </td>
                  <td className="px-4 py-3">
                    <IncidentStatusBadge status={incident.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {incident.assignedToName ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(incident.detectedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="text-accent hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
