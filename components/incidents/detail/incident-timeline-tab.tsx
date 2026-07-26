"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { IncidentDetail } from "@/types/incidents";

interface IncidentTimelineTabProps {
  incident: IncidentDetail;
}

export function IncidentTimelineTab({ incident }: IncidentTimelineTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <CardDescription>
          Append-only history of workflow and analyst actions (newest first).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {incident.activities.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {incident.activities.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {a.message}
                    </p>
                    <p className="text-xs text-muted">
                      {formatRelativeTime(a.createdAt)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {a.activityType.replaceAll("_", " ")}
                    {" · "}
                    {a.actorName ?? a.actorEmail ?? "System"}
                    {" · "}
                    {formatDate(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
