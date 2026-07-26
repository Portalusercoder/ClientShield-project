"use client";

import Link from "next/link";
import {
  addEventAction,
  removeEventAction,
} from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { TabBaseProps } from "./shared";

export function EventsTab({
  investigation,
  canAct,
  closed,
  isPending,
  runAction,
}: TabBaseProps) {
  return (
    <div className="space-y-4">
      {canAct && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Add security event</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              action={(fd) => {
                fd.set("groupId", investigation.id);
                runAction(
                  () => addEventAction(fd),
                  "Event added to investigation"
                );
              }}
            >
              <input
                name="securityEventId"
                required
                placeholder="Security event ID"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <Button type="submit" size="sm" disabled={isPending}>
                Add event
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {investigation.events.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
          No events in this investigation.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">First / Last</th>
                {canAct && !closed && (
                  <th className="px-4 py-3 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {investigation.events.map((ev) => (
                <tr key={ev.linkId} className="hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/security-events/${ev.securityEventId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {ev.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{ev.severity}</td>
                  <td className="px-4 py-3 text-muted">{ev.status}</td>
                  <td className="px-4 py-3 text-muted">
                    {ev.agentName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>{formatDateTime(ev.firstSeenAt)}</div>
                    <div>{formatDateTime(ev.lastSeenAt)}</div>
                  </td>
                  {canAct && !closed && (
                    <td className="px-4 py-3">
                      <form
                        className="flex flex-col gap-1"
                        action={(fd) => {
                          fd.set("groupId", investigation.id);
                          fd.set("securityEventId", ev.securityEventId);
                          runAction(
                            () => removeEventAction(fd),
                            "Event removed"
                          );
                        }}
                      >
                        <input
                          name="reason"
                          required
                          placeholder="Reason"
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                        >
                          Remove
                        </Button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
