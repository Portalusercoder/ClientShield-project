"use client";

import Link from "next/link";
import { SecurityEventSeverityBadge } from "@/components/security-events/security-event-badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { LinkedSecurityEventRow } from "@/components/incidents/detail/shared";

interface IncidentSecurityEventsTabProps {
  securityEvents: LinkedSecurityEventRow[];
}

export function IncidentSecurityEventsTab({
  securityEvents,
}: IncidentSecurityEventsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Security Events</CardTitle>
        <CardDescription>
          Wazuh-derived events escalated or linked to this incident.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {securityEvents.length === 0 ? (
          <p className="text-sm text-muted">No security events linked.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Wazuh Rule</th>
                  <th className="py-2 pr-3">Asset</th>
                  <th className="py-2 pr-3">Occurrences</th>
                  <th className="py-2 pr-3">First Seen</th>
                  <th className="py-2">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {securityEvents.map((e) => (
                  <tr key={e.linkId}>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/security-events/${e.id}`}
                        className="hover:text-accent"
                      >
                        {e.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <SecurityEventSeverityBadge
                        severity={
                          e.severity as import("@prisma/client").SecurityEventSeverity
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {e.ruleId ?? "—"}
                      {e.ruleDescription
                        ? ` — ${e.ruleDescription}`
                        : ""}
                    </td>
                    <td className="py-2 pr-3">{e.assetName ?? "—"}</td>
                    <td className="py-2 pr-3">{e.occurrenceCount}</td>
                    <td className="py-2 pr-3">
                      {formatDate(e.firstSeenAt)}
                    </td>
                    <td className="py-2">{formatDate(e.lastSeenAt)}</td>
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
