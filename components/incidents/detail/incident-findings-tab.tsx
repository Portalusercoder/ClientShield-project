"use client";

import Link from "next/link";
import {
  linkFindingAction,
  searchFindingsForLinkAction,
  unlinkFindingAction,
} from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkflowEmptyState } from "@/components/workflow/workflow-empty-state";
import { formatRelativeTime } from "@/lib/utils";
import type { IncidentDetail } from "@/types/incidents";

interface FindingSearchResult {
  id: string;
  title: string;
  severity: string;
  status: string;
  assetName: string | null;
}

interface IncidentFindingsTabProps {
  incident: IncidentDetail;
  canManage: boolean;
  isPending: boolean;
  findingSearch: string;
  setFindingSearch: (v: string) => void;
  findingResults: FindingSearchResult[];
  setFindingResults: (results: FindingSearchResult[]) => void;
  linkedFindingIds: Set<string>;
  startTransition: (fn: () => Promise<void>) => void;
  setError: (error: string) => void;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentFindingsTab({
  incident,
  canManage,
  isPending,
  findingSearch,
  setFindingSearch,
  findingResults,
  setFindingResults,
  linkedFindingIds,
  startTransition,
  setError,
  runAction,
}: IncidentFindingsTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Linked Findings</CardTitle>
          <CardDescription>
            Findings in the same organization. Prefer same-client matches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incident.findings.length === 0 ? (
            <WorkflowEmptyState
              className="py-8"
              title="No Findings linked"
              why="Findings document concluded issues that support this response case."
              nextAction="Search and link Findings from the panel below, or open an Investigation to create one."
              secondaryHref="/vulnerabilities"
              secondaryLabel="Browse Findings"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="py-2 pr-3">Finding</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Asset</th>
                    <th className="py-2 pr-3">Instances</th>
                    <th className="py-2 pr-3">Last Detected</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {incident.findings.map((f) => (
                    <tr key={f.linkId}>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/vulnerabilities/${f.findingId}`}
                          className="hover:text-accent"
                        >
                          {f.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{f.severity}</td>
                      <td className="py-2 pr-3">{f.status}</td>
                      <td className="py-2 pr-3">{f.source}</td>
                      <td className="py-2 pr-3">{f.assetName ?? "—"}</td>
                      <td className="py-2 pr-3">{f.instanceCount}</td>
                      <td className="py-2 pr-3">
                        {formatRelativeTime(f.lastDetectedAt)}
                      </td>
                      <td className="py-2">
                        {canManage && (
                          <button
                            type="button"
                            className="text-xs text-danger hover:underline"
                            disabled={isPending}
                            onClick={() =>
                              runAction(() =>
                                unlinkFindingAction(
                                  incident.id,
                                  f.findingId
                                )
                              )
                            }
                          >
                            Unlink
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {incident.remediations.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-foreground">
                Related Remediation
              </h3>
              <ul className="mt-2 space-y-2">
                {incident.remediations.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="text-muted">
                      {" "}
                      · {r.status} · {r.priority} · from {r.findingTitle}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Link Finding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <input
                value={findingSearch}
                onChange={(e) => setFindingSearch(e.target.value)}
                placeholder="Search findings…"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await searchFindingsForLinkAction({
                      clientId: incident.clientId,
                      search: findingSearch,
                    });
                    if (result.success) setFindingResults(result.data);
                    else setError(result.error);
                  })
                }
              >
                Search
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {findingResults.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-xs text-muted">
                      {f.severity} · {f.status} · {f.assetName ?? "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending || linkedFindingIds.has(f.id)}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("findingId", f.id);
                      runAction(() =>
                        linkFindingAction(incident.id, fd)
                      );
                    }}
                  >
                    {linkedFindingIds.has(f.id) ? "Linked" : "Link"}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
