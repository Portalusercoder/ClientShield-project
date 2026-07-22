"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateRemediationTaskAction } from "@/app/(dashboard)/vulnerabilities/actions";
import { RemediationStatusBadge } from "@/components/findings/finding-badges";
import { SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { RemediationListItem } from "@/types/findings";

export function RemediationTable({
  tasks,
  canUpdate,
}: {
  tasks: RemediationListItem[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No remediation tasks"
        description="Create remediation tasks from a finding detail page to track ownership and due dates."
      />
    );
  }

  function markComplete(taskId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("status", "COMPLETED");
      await updateRemediationTaskAction(taskId, fd);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Task</th>
            <th className="px-4 py-3 font-medium text-muted">Finding</th>
            <th className="px-4 py-3 font-medium text-muted">Client</th>
            <th className="px-4 py-3 font-medium text-muted">Asset</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Assigned To</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="px-4 py-3 font-medium text-muted">Due Date</th>
            {canUpdate && (
              <th className="px-4 py-3 font-medium text-muted">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((task) => (
            <tr key={task.id} className="bg-surface">
              <td className="px-4 py-3 font-medium text-foreground">
                {task.title}
              </td>
              <td className="px-4 py-3">
                {task.findingId ? (
                  <Link
                    href={`/vulnerabilities/${task.findingId}`}
                    className="text-accent hover:underline"
                  >
                    {task.findingTitle}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {task.clientName ?? "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/assets/${task.assetId}`}
                  className="text-muted hover:text-accent"
                >
                  {task.assetName}
                </Link>
              </td>
              <td className="px-4 py-3">
                {task.findingSeverity ? (
                  <SeverityBadge severity={task.findingSeverity} />
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {task.assignedToName ?? "Unassigned"}
              </td>
              <td className="px-4 py-3">
                <RemediationStatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3">
                {task.dueDate ? (
                  <span
                    className={task.isOverdue ? "text-danger" : "text-muted"}
                  >
                    {formatDate(task.dueDate)}
                    {task.isOverdue ? " (overdue)" : ""}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              {canUpdate && (
                <td className="px-4 py-3">
                  {task.status !== "COMPLETED" &&
                    task.status !== "CANCELLED" && (
                      <Button
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => markComplete(task.id)}
                      >
                        Complete
                      </Button>
                    )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
