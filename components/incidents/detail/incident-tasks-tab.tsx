"use client";

import {
  assignResponseTaskAction,
  createResponseTaskAction,
  updateResponseTaskStatusAction,
} from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ResponseTaskItem } from "@/types/incident-case";
import type { IncidentDetail } from "@/types/incidents";
import type { ResponseTaskStatus } from "@prisma/client";
import {
  PLAYBOOK_PHASES,
  TASK_STATUSES,
} from "@/components/incidents/detail/shared";

export type TaskReasons = Record<
  string,
  { blockedReason: string; skipReason: string; completionNote: string }
>;

interface IncidentTasksTabProps {
  incident: IncidentDetail;
  tasks: ResponseTaskItem[];
  canManage: boolean;
  isPending: boolean;
  taskReasons: TaskReasons;
  setTaskReasons: React.Dispatch<React.SetStateAction<TaskReasons>>;
  setError: (error: string | null) => void;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentTasksTab({
  incident,
  tasks,
  canManage,
  isPending,
  taskReasons,
  setTaskReasons,
  setError,
  runAction,
}: IncidentTasksTabProps) {
  function getTaskReason(taskId: string) {
    return (
      taskReasons[taskId] ?? {
        blockedReason: "",
        skipReason: "",
        completionNote: "",
      }
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Create Response Task</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                runAction(async () => {
                  const result = await createResponseTaskAction(
                    incident.id,
                    fd
                  );
                  if (result.success) form.reset();
                  return result;
                });
              }}
            >
              <input
                name="title"
                required
                placeholder="Task title"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
              />
              <select
                name="phase"
                defaultValue="INVESTIGATION"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {PLAYBOOK_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <select
                name="priority"
                defaultValue="MEDIUM"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <textarea
                name="description"
                rows={2}
                placeholder="Description (optional)"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="isRequired" value="true" />
                Required for closure
              </label>
              <Button type="submit" disabled={isPending} size="sm">
                Add Task
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Response Tasks</CardTitle>
          <CardDescription>
            Update status; BLOCKED and SKIPPED require a reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">No response tasks yet.</p>
          ) : (
            <ul className="space-y-4">
              {tasks.map((task) => {
                const reasons = getTaskReason(task.id);
                return (
                  <li
                    key={task.id}
                    className="rounded-md border border-border px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {task.title}
                          {task.isRequired && (
                            <span className="ml-2 text-[10px] uppercase text-danger">
                              Required
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {task.phase.replaceAll("_", " ")} ·{" "}
                          {task.priority} ·{" "}
                          {task.assignedToName ?? "Unassigned"}
                        </p>
                        {task.description && (
                          <p className="mt-1 text-sm text-muted">
                            {task.description}
                          </p>
                        )}
                        {task.blockedReason && (
                          <p className="mt-1 text-xs text-warning">
                            Blocked: {task.blockedReason}
                          </p>
                        )}
                        {task.skipReason && (
                          <p className="mt-1 text-xs text-muted">
                            Skipped: {task.skipReason}
                          </p>
                        )}
                      </div>
                      <span className="rounded-md border border-border px-2 py-0.5 text-xs">
                        {task.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    {canManage && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="block text-xs text-muted">
                            Change status
                          </label>
                          <select
                            value={task.status}
                            disabled={isPending}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            onChange={(e) => {
                              const status = e.target
                                .value as ResponseTaskStatus;
                              const fd = new FormData();
                              fd.set("status", status);
                              const r = getTaskReason(task.id);
                              if (status === "BLOCKED") {
                                if (!r.blockedReason.trim()) {
                                  setError(
                                    "Blocked reason is required for BLOCKED status."
                                  );
                                  return;
                                }
                                fd.set("blockedReason", r.blockedReason);
                              }
                              if (status === "SKIPPED") {
                                if (!r.skipReason.trim()) {
                                  setError(
                                    "Skip reason is required for SKIPPED status."
                                  );
                                  return;
                                }
                                fd.set("skipReason", r.skipReason);
                              }
                              if (
                                status === "COMPLETED" &&
                                r.completionNote.trim()
                              ) {
                                fd.set(
                                  "completionNote",
                                  r.completionNote
                                );
                              }
                              runAction(() =>
                                updateResponseTaskStatusAction(
                                  incident.id,
                                  task.id,
                                  fd
                                )
                              );
                            }}
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                          <input
                            value={reasons.blockedReason}
                            onChange={(e) =>
                              setTaskReasons((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...getTaskReason(task.id),
                                  blockedReason: e.target.value,
                                },
                              }))
                            }
                            placeholder="Blocked reason"
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                          />
                          <input
                            value={reasons.skipReason}
                            onChange={(e) =>
                              setTaskReasons((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...getTaskReason(task.id),
                                  skipReason: e.target.value,
                                },
                              }))
                            }
                            placeholder="Skip reason"
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                          />
                          <input
                            value={reasons.completionNote}
                            onChange={(e) =>
                              setTaskReasons((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...getTaskReason(task.id),
                                  completionNote: e.target.value,
                                },
                              }))
                            }
                            placeholder="Completion note (optional)"
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                          />
                        </div>
                        <form
                          className="space-y-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            runAction(() =>
                              assignResponseTaskAction(
                                incident.id,
                                task.id,
                                fd
                              )
                            );
                          }}
                        >
                          <label className="block text-xs text-muted">
                            Assign task
                          </label>
                          <div className="flex gap-2">
                            <select
                              name="assignedToUserId"
                              defaultValue={task.assignedToUserId ?? ""}
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              <option value="">Unassigned</option>
                              {incident.users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name ?? u.email}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={isPending}
                            >
                              Assign
                            </Button>
                          </div>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
