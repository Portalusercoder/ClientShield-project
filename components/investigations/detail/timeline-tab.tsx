import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { InvestigationDetailViewModel } from "@/types/investigations";

export function TimelineTab({
  investigation,
}: {
  investigation: InvestigationDetailViewModel;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Chronological security events and investigation activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(() => {
          const eventEntries = investigation.events.map((ev) => ({
            id: `event-${ev.linkId}`,
            at: ev.firstSeenAt,
            kind: "event" as const,
            title: ev.title,
            detail: `${ev.severity} · ${ev.status}`,
            href: `/security-events/${ev.securityEventId}`,
          }));
          const activityEntries = investigation.activities.map((a) => ({
            id: `activity-${a.id}`,
            at: a.createdAt,
            kind: "activity" as const,
            title: a.message,
            detail: [
              a.activityType.replaceAll("_", " "),
              a.actorName || a.actorEmail || null,
              a.note ? a.note.slice(0, 120) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            href: null as string | null,
          }));
          const entries = [...eventEntries, ...activityEntries].sort(
            (a, b) => a.at.getTime() - b.at.getTime()
          );
          if (entries.length === 0) {
            return (
              <p className="text-sm text-muted">No timeline entries yet.</p>
            );
          }
          return (
            <ol className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex gap-3 border-b border-border/50 pb-3 last:border-0"
                >
                  <div className="w-40 shrink-0 text-xs text-muted">
                    {formatDateTime(entry.at)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {entry.href ? (
                      <Link
                        href={entry.href}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {entry.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-foreground">
                        {entry.title}
                      </p>
                    )}
                    <p className="text-xs text-muted">{entry.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          );
        })()}
      </CardContent>
    </Card>
  );
}
