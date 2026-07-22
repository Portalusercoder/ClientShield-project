"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { escalateFindingAction } from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface EscalateFindingButtonProps {
  findingId: string;
  findingTitle: string;
  suggestedSeverity: string;
}

export function EscalateFindingButton({
  findingId,
  findingTitle,
  suggestedSeverity,
}: EscalateFindingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Create Incident
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create Incident from Finding</CardTitle>
          <CardDescription>
            Analyst confirmation required. Scanner evidence is not copied into
            the incident description.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              startTransition(async () => {
                const result = await escalateFindingAction(fd);
                if (result.success) {
                  setOpen(false);
                  router.push(`/incidents/${result.data.id}`);
                  router.refresh();
                } else {
                  setError(result.error);
                }
              });
            }}
          >
            <input type="hidden" name="findingId" value={findingId} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Title</span>
              <input
                name="title"
                required
                defaultValue={`Security Incident: ${findingTitle}`}
                maxLength={300}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Severity</span>
              <select
                name="severity"
                defaultValue={suggestedSeverity}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Description</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={`Escalated from finding "${findingTitle}". Analyst-confirmed incident — scanner evidence not copied.`}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <input
              type="hidden"
              name="category"
              value="VULNERABILITY_EXPLOITATION"
            />
            {error && (
              <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Confirm Create Incident"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
