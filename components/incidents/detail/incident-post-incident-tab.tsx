"use client";

import { updateIncidentResponseAction } from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IncidentDetail } from "@/types/incidents";

interface IncidentPostIncidentTabProps {
  incident: IncidentDetail;
  canManage: boolean;
  isPending: boolean;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentPostIncidentTab({
  incident,
  canManage,
  isPending,
  runAction,
}: IncidentPostIncidentTabProps) {
  return (
    <div className="space-y-4">
      {(
        [
          ["lessonsLearned", "Lessons Learned", incident.lessonsLearned],
          ["whatWentWell", "What Went Well", incident.whatWentWell],
          [
            "whatCouldImprove",
            "What Could Improve",
            incident.whatCouldImprove,
          ],
          [
            "followUpActions",
            "Follow-up Actions",
            incident.followUpActions,
          ],
        ] as const
      ).map(([field, label, value]) => (
        <Card key={field}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
          </CardHeader>
          <CardContent>
            {!canManage ? (
              <p className="whitespace-pre-wrap text-sm">
                {value || "Not documented yet."}
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  runAction(() =>
                    updateIncidentResponseAction(incident.id, fd)
                  );
                }}
              >
                <textarea
                  name={field}
                  defaultValue={value ?? ""}
                  rows={4}
                  maxLength={5000}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder={`Document ${label.toLowerCase()}…`}
                />
                <Button type="submit" disabled={isPending} size="sm">
                  Save {label}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
