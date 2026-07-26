"use client";

import { addIncidentNoteAction } from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { IncidentDetail } from "@/types/incidents";

interface IncidentNotesTabProps {
  incident: IncidentDetail;
  canManage: boolean;
  isPending: boolean;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentNotesTab({
  incident,
  canManage,
  isPending,
  runAction,
}: IncidentNotesTabProps) {
  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Add Note</CardTitle>
            <CardDescription>
              Notes are immutable after creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                runAction(async () => {
                  const result = await addIncidentNoteAction(
                    incident.id,
                    fd
                  );
                  if (result.success) form.reset();
                  return result;
                });
              }}
            >
              <textarea
                name="content"
                required
                rows={3}
                maxLength={5000}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Analyst note…"
              />
              <Button type="submit" disabled={isPending}>
                Add Note
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {incident.notes.length === 0 ? (
            <p className="text-sm text-muted">No notes yet.</p>
          ) : (
            <ul className="space-y-4">
              {incident.notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-border px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {n.authorName ?? n.authorEmail}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {n.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
