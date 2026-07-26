"use client";

import Link from "next/link";
import type { useRouter } from "next/navigation";
import {
  createFindingFromInvestigationAction,
  linkFindingToInvestigationAction,
  unlinkFindingFromInvestigationAction,
} from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkflowEmptyState } from "@/components/workflow/workflow-empty-state";
import type { TabBaseProps } from "./shared";

interface FindingsTabProps extends TabBaseProps {
  router: ReturnType<typeof useRouter>;
}

export function FindingsTab({
  investigation,
  canAct,
  closed,
  isPending,
  runAction,
  router,
}: FindingsTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Findings record what was concluded from this investigation. Closing
        the investigation does not change Finding status; resolving a Finding
        does not change the investigation.
      </p>
      {investigation.findings.length === 0 ? (
        <WorkflowEmptyState
          title="No Findings yet"
          why="An Investigation concludes by recording Findings — nothing has been created or linked."
          nextAction="Create a Finding from this investigation or link an existing one below."
          actionLabel={canAct && !closed ? "Scroll to create" : null}
          actionHref={canAct && !closed ? "#create-finding" : null}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {investigation.findings.map((f) => (
                <tr key={f.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/vulnerabilities/${f.id}`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {f.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.severity}</td>
                  <td className="px-4 py-3 text-muted">{f.status}</td>
                  <td className="px-4 py-3 text-muted">
                    {f.assetName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canAct ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("groupId", investigation.id);
                          fd.set("findingId", f.id);
                          runAction(
                            () => unlinkFindingFromInvestigationAction(fd),
                            "Finding unlinked"
                          );
                        }}
                      >
                        Unlink
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canAct && !closed && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
            <div id="create-finding">
              <CardTitle>Create Finding</CardTitle>
            </div>
              <CardDescription>
                Analyst-confirmed only. Severity may inherit once; statuses
                stay independent afterward.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                action={(fd) => {
                  fd.set("groupId", investigation.id);
                  runAction(async () => {
                    const result =
                      await createFindingFromInvestigationAction(fd);
                    if (result.success && result.data?.findingId) {
                      router.push(
                        `/vulnerabilities/${result.data.findingId}`
                      );
                    }
                    return result;
                  }, "Finding created");
                }}
              >
                <input
                  name="title"
                  required
                  defaultValue={investigation.findingCreateDefaults.title}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Finding title"
                />
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={
                    investigation.findingCreateDefaults.description
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Description"
                />
                <select
                  name="severity"
                  defaultValue={
                    investigation.findingCreateDefaults.severity
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
                <select
                  name="assetId"
                  required
                  defaultValue={
                    investigation.findingCreateDefaults.assetId ?? ""
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Select asset…
                  </option>
                  {investigation.orgAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    name="inheritAssignee"
                    value="true"
                    defaultChecked={Boolean(
                      investigation.findingCreateDefaults.assignedToUserId
                    )}
                  />
                  Assign to investigation assignee (optional)
                </label>
                <Button type="submit" size="sm" disabled={isPending}>
                  Create Finding
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Link existing Finding</CardTitle>
              <CardDescription>
                Sets this investigation as the Finding&apos;s primary
                investigation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {investigation.linkableFindings.length === 0 ? (
                <p className="text-sm text-muted">
                  No linkable findings in scope.
                </p>
              ) : (
                <form
                  className="space-y-3"
                  action={(fd) => {
                    fd.set("groupId", investigation.id);
                    runAction(
                      () => linkFindingToInvestigationAction(fd),
                      "Finding linked"
                    );
                  }}
                >
                  <select
                    name="findingId"
                    required
                    defaultValue=""
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Select finding…
                    </option>
                    {investigation.linkableFindings.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title} ({f.severity}/{f.status})
                        {f.alreadyLinkedElsewhere
                          ? " — linked elsewhere"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" disabled={isPending}>
                    Link Finding
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
