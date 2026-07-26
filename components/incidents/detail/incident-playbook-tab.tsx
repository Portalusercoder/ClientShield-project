"use client";

import { assignPlaybookAction } from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type {
  PlaybookListItem,
  PlaybookSuggestion,
} from "@/types/incident-case";
import type { PlaybookInstanceRow } from "@/components/incidents/detail/shared";

interface IncidentPlaybookTabProps {
  incidentId: string;
  playbooks: PlaybookListItem[];
  suggestion: PlaybookSuggestion | null;
  playbookInstances: PlaybookInstanceRow[];
  canManage: boolean;
  isPending: boolean;
  confirmPlaybookId: string | null;
  setConfirmPlaybookId: (id: string | null) => void;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentPlaybookTab({
  incidentId,
  playbooks,
  suggestion,
  playbookInstances,
  canManage,
  isPending,
  confirmPlaybookId,
  setConfirmPlaybookId,
  runAction,
}: IncidentPlaybookTabProps) {
  return (
    <div className="space-y-4">
      {suggestion && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Suggested Playbook
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                Suggested
              </span>
            </CardTitle>
            <CardDescription>{suggestion.reason}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {suggestion.playbookName || suggestion.name}
            </p>
            {canManage && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  setConfirmPlaybookId(suggestion.playbookId)
                }
              >
                Assign suggested
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {playbookInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Playbooks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {playbookInstances.map((inst) => (
                <li
                  key={inst.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <p className="font-medium">{inst.playbookName}</p>
                  <p className="text-xs text-muted">
                    {inst.taskCount} tasks · assigned{" "}
                    {formatRelativeTime(inst.assignedAt)}
                    {inst.assignedByName
                      ? ` by ${inst.assignedByName}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Available Playbooks</CardTitle>
          <CardDescription>
            Assign a response playbook to generate tasks for this case.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {playbooks.length === 0 ? (
            <p className="text-sm text-muted">No playbooks available.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {playbooks.map((pb) => {
                const isSuggested = suggestion?.playbookId === pb.id;
                return (
                  <li
                    key={pb.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {pb.name}
                        {isSuggested && (
                          <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                            Suggested
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {pb.stepCount} steps
                        {pb.category
                          ? ` · ${pb.category.replaceAll("_", " ")}`
                          : ""}
                        {pb.description ? ` — ${pb.description}` : ""}
                      </p>
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        variant={isSuggested ? "primary" : "secondary"}
                        disabled={isPending}
                        onClick={() => setConfirmPlaybookId(pb.id)}
                      >
                        Assign
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirmPlaybookId && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Playbook Assignment</CardTitle>
            <CardDescription>
              This will create response tasks from the playbook steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              disabled={isPending}
              onClick={() => {
                const fd = new FormData();
                fd.set("playbookId", confirmPlaybookId);
                runAction(async () => {
                  const result = await assignPlaybookAction(
                    incidentId,
                    fd
                  );
                  if (result.success) setConfirmPlaybookId(null);
                  return result;
                });
              }}
            >
              Confirm assign
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmPlaybookId(null)}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
