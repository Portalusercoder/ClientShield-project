"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  SecurityEventClassificationBadge,
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";
import { formatDateTime } from "@/lib/utils";
import type { SecurityEventListItem } from "@/types/security-events";

export function SecurityEventsTable({
  events,
  page,
  pageSize,
  total,
}: {
  events: SecurityEventListItem[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    return `/security-events?${params.toString()}`;
  };

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
        No security events match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-surface-elevated text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Wazuh Rule</th>
              <th className="px-4 py-3">Rule Level</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Occurrences</th>
              <th className="px-4 py-3">First Seen</th>
              <th className="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-surface-elevated/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/security-events/${event.id}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {event.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <SecurityEventSeverityBadge severity={event.severity} />
                </td>
                <td className="px-4 py-3">
                  <SecurityEventClassificationBadge
                    classification={event.classification}
                  />
                </td>
                <td className="px-4 py-3 text-muted">
                  {event.clientName ?? (
                    <span className="text-severity-medium">Unmapped</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {event.assetName ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {event.ruleId ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {event.ruleLevel ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <SecurityEventStatusBadge status={event.status} />
                </td>
                <td className="px-4 py-3">{event.occurrenceCount}</td>
                <td className="px-4 py-3 text-muted">
                  {formatDateTime(event.firstSeenAt)}
                </td>
                <td className="px-4 py-3 text-muted">
                  {formatDateTime(event.lastSeenAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
        <span>
          Page {page} of {totalPages} · {total} events
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              className="rounded border border-border px-2 py-1 hover:text-foreground"
            >
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={pageHref(page + 1)}
              className="rounded border border-border px-2 py-1 hover:text-foreground"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
