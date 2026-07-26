"use client";

import {
  addEvidenceNoteAction,
  linkEvidenceFindingAction,
  linkEvidenceSecurityEventAction,
} from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { EvidenceItem } from "@/types/incident-case";
import type { IncidentDetail } from "@/types/incidents";
import type { LinkedSecurityEventRow } from "@/components/incidents/detail/shared";

interface IncidentEvidenceTabProps {
  incident: IncidentDetail;
  securityEvents: LinkedSecurityEventRow[];
  evidence: EvidenceItem[];
  canManage: boolean;
  isPending: boolean;
  evidencedSeIds: Set<string>;
  evidencedFindingIds: Set<string>;
  runAction: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
}

export function IncidentEvidenceTab({
  incident,
  securityEvents,
  evidence,
  canManage,
  isPending,
  evidencedSeIds,
  evidencedFindingIds,
  runAction,
}: IncidentEvidenceTabProps) {
  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Add Note Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                runAction(async () => {
                  const result = await addEvidenceNoteAction(
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
                placeholder="Evidence title"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                name="description"
                rows={2}
                placeholder="Description (optional)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                name="url"
                type="url"
                placeholder="URL (optional)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" disabled={isPending} size="sm">
                Add Evidence Note
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Link Security Event Evidence</CardTitle>
              <CardDescription>
                From events already linked to this incident.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {securityEvents.length === 0 ? (
                <p className="text-sm text-muted">
                  No linked security events.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {securityEvents.map((e) => (
                    <li
                      key={e.linkId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.title}</p>
                        <p className="text-xs text-muted">
                          {e.severity} · {e.ruleId ?? "no rule"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          isPending || evidencedSeIds.has(e.id)
                        }
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("securityEventId", e.id);
                          runAction(() =>
                            linkEvidenceSecurityEventAction(
                              incident.id,
                              fd
                            )
                          );
                        }}
                      >
                        {evidencedSeIds.has(e.id) ? "Linked" : "Link"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Link Finding Evidence</CardTitle>
              <CardDescription>
                From findings already linked to this incident.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incident.findings.length === 0 ? (
                <p className="text-sm text-muted">No linked findings.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {incident.findings.map((f) => (
                    <li
                      key={f.linkId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{f.title}</p>
                        <p className="text-xs text-muted">
                          {f.severity} · {f.status}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          isPending ||
                          evidencedFindingIds.has(f.findingId)
                        }
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("findingId", f.findingId);
                          runAction(() =>
                            linkEvidenceFindingAction(incident.id, fd)
                          );
                        }}
                      >
                        {evidencedFindingIds.has(f.findingId)
                          ? "Linked"
                          : "Link"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Evidence Log</CardTitle>
        </CardHeader>
        <CardContent>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted">No evidence recorded.</p>
          ) : (
            <ul className="space-y-3">
              {evidence.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      <span className="mr-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted">
                        {e.type}
                      </span>
                      {e.title}
                    </p>
                    <p className="text-xs text-muted">
                      {formatRelativeTime(e.collectedAt)}
                    </p>
                  </div>
                  {e.description && (
                    <p className="mt-1 text-muted">{e.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {e.collectedByName ?? e.collectedByEmail ?? "System"}
                    {e.url ? (
                      <>
                        {" · "}
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          Open link
                        </a>
                      </>
                    ) : null}
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
