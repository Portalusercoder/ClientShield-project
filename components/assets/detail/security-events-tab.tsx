import Link from "next/link";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { AssetSecurityEventItem } from "./types";

interface SecurityEventsTabProps {
  assetId: string;
  securityEvents: AssetSecurityEventItem[];
}

export function SecurityEventsTab({
  assetId,
  securityEvents,
}: SecurityEventsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {securityEvents.length} mapped event
          {securityEvents.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/security-events?assetId=${assetId}`}
          className="text-sm text-accent hover:underline"
        >
          View in Security Events
        </Link>
      </div>
      {securityEvents.length === 0 ? (
        <EmptyState
          title="No security events"
          description="Mapped Wazuh security events for this asset will appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Occurrences</th>
                <th className="px-4 py-3 font-medium">Last Seen</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {securityEvents.map((event) => (
                <tr key={event.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <SecurityEventSeverityBadge
                      severity={event.severity}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{event.title}</td>
                  <td className="px-4 py-3">
                    <SecurityEventStatusBadge
                      status={
                        event.status as import("@prisma/client").SecurityEventStatus
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {event.ruleId ?? "—"}
                  </td>
                  <td className="px-4 py-3">{event.occurrenceCount}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(event.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/security-events/${event.id}`}
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
