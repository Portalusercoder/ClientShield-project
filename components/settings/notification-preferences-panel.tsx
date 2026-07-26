/**
 * Phase 6b5 — notification preference settings (store only; no delivery).
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { upsertNotificationPreferenceAction } from "@/app/(dashboard)/settings/notification-preference-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NotificationChannel, NotificationType } from "@prisma/client";

type PrefRow = {
  eventType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
};

const CHANNELS: NotificationChannel[] = [
  "IN_APP",
  "EMAIL",
  "SLACK",
  "WEBHOOK",
];

const EVENT_LABELS: Partial<Record<NotificationType, string>> = {
  INCIDENT_CREATED_CRITICAL: "Critical incident created",
  INCIDENT_ASSIGNED: "Incident assigned",
  INCIDENT_RESOLVED: "Incident resolved",
  FINDING_ASSIGNED: "Finding assigned",
  FINDING_CREATED: "Finding created",
  INVESTIGATION_CONFIRMED: "Investigation confirmed",
  INVESTIGATION_ASSIGNED: "Investigation assigned",
  INVESTIGATION_REOPENED: "Investigation reopened",
  CLAIM_TRANSFERRED: "Claim transferred",
};

interface NotificationPreferencesPanelProps {
  preferences: PrefRow[];
}

export function NotificationPreferencesPanel({
  preferences: initial,
}: NotificationPreferencesPanelProps) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const eventTypes = useMemo(() => {
    const set = new Set(prefs.map((p) => p.eventType));
    return [...set];
  }, [prefs]);

  function isEnabled(eventType: NotificationType, channel: NotificationChannel) {
    return (
      prefs.find((p) => p.eventType === eventType && p.channel === channel)
        ?.enabled ?? channel === "IN_APP"
    );
  }

  function toggle(
    eventType: NotificationType,
    channel: NotificationChannel,
    enabled: boolean
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await upsertNotificationPreferenceAction({
        eventType,
        channel,
        enabled,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to save preference");
        return;
      }
      setPrefs((prev) => {
        const idx = prev.findIndex(
          (p) => p.eventType === eventType && p.channel === channel
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], enabled };
          return next;
        }
        return [...prev, { eventType, channel, enabled }];
      });
      setMessage("Preference saved (in-app delivery only today).");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Choose channels per event type. Only In-app notifications are produced
          today — Email, Slack, and Webhook are stored for future delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || message) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              error
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-success/30 bg-success/10 text-success"
            }`}
          >
            {error ?? message}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                {CHANNELS.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    {c.replace("_", "-")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eventTypes.map((eventType) => (
                <tr key={eventType}>
                  <td className="px-3 py-2 text-foreground">
                    {EVENT_LABELS[eventType] ?? eventType}
                  </td>
                  {CHANNELS.map((channel) => (
                    <td key={channel} className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isEnabled(eventType, channel)}
                        disabled={isPending}
                        onChange={(e) =>
                          toggle(eventType, channel, e.target.checked)
                        }
                        aria-label={`${eventType} ${channel}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
