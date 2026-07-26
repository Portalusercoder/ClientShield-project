"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  acceptSeInvestigationSuggestionAction,
  createInvestigationFromSecurityEventAction,
  dismissSeInvestigationSuggestionAction,
  linkSecurityEventToInvestigationAction,
} from "@/app/(dashboard)/security-events/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SecurityEventInvestigationHandoff } from "@/types/security-events";

interface SecurityEventInvestigationPanelProps {
  securityEventId: string;
  handoff: SecurityEventInvestigationHandoff;
  canTriage: boolean;
}

export function SecurityEventInvestigationPanel({
  securityEventId,
  handoff,
  canTriage,
}: SecurityEventInvestigationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [title, setTitle] = useState(handoff.createDefaults.title);
  const [severity, setSeverity] = useState(handoff.createDefaults.severity);
  const [inheritOwner, setInheritOwner] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(
    handoff.linkable[0]?.id ?? ""
  );
  const [dismissReason, setDismissReason] = useState("");

  const filteredLinkable = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    if (!q) return handoff.linkable;
    return handoff.linkable.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.status.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    );
  }, [handoff.linkable, linkQuery]);

  const stateLabel =
    handoff.panelState === "NONE"
      ? "No investigation"
      : handoff.panelState === "SUGGESTED"
        ? "Suggested investigation"
        : handoff.panelState === "MULTIPLE"
          ? "Multiple related investigations"
          : "Linked investigation";

  const run = (
    fn: () => Promise<{
      success: boolean;
      error?: string;
      data?: { investigationId?: string } | void;
    }>,
    opts?: { navigateToInvestigation?: boolean }
  ) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Action failed");
        return;
      }
      if (opts?.navigateToInvestigation && result.data?.investigationId) {
        router.push(`/investigations/${result.data.investigationId}`);
        return;
      }
      setMessage("Saved.");
      setShowCreate(false);
      setShowLink(false);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investigations</CardTitle>
        <CardDescription>
          {stateLabel}. Create or link without pasting event IDs. Browser Back
          returns here from an opened investigation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error && (
          <p className="rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-severity-medium">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-muted">
            {message}
          </p>
        )}

        {handoff.linked.length === 0 ? (
          <p className="text-muted">
            This security event is not linked to an investigation yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {handoff.linked.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="font-medium text-foreground">{g.title}</p>
                  <p className="text-xs text-muted">
                    {g.status.replaceAll("_", " ")} · {g.severity} ·{" "}
                    {g.createdByType.replaceAll("_", " ")} · {g.eventCount}{" "}
                    event{g.eventCount === 1 ? "" : "s"}
                    {g.assignedToName ? ` · Owner ${g.assignedToName}` : ""}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/investigations/${g.id}`)}
                >
                  Open Investigation
                </Button>
              </li>
            ))}
          </ul>
        )}

        {handoff.suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground">Suggested (correlation)</p>
            <p className="text-xs text-muted">
              SYSTEM / correlation candidates. Accept never auto-confirms.
            </p>
            <ul className="space-y-2">
              {handoff.suggestions.map((s) => (
                <li
                  key={s.candidateId}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <p className="text-foreground">
                    Related event:{" "}
                    <Link
                      className="underline"
                      href={`/security-events/${s.otherEventId}`}
                    >
                      {s.otherEventTitle}
                    </Link>
                  </p>
                  <p className="text-xs text-muted">
                    Score {s.score} · {s.confidence}
                    {s.investigationTitle
                      ? ` · Group: ${s.investigationTitle}`
                      : ""}
                  </p>
                  {s.reasons.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {s.reasons.slice(0, 3).join("; ")}
                    </p>
                  )}
                  {canTriage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              acceptSeInvestigationSuggestionAction({
                                securityEventId,
                                candidateId: s.candidateId,
                              }),
                            { navigateToInvestigation: true }
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            dismissSeInvestigationSuggestionAction({
                              securityEventId,
                              candidateId: s.candidateId,
                              reason: dismissReason || undefined,
                            })
                          )
                        }
                      >
                        Dismiss
                      </Button>
                      {s.investigationGroupId && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            router.push(
                              `/investigations/${s.investigationGroupId}`
                            )
                          }
                        >
                          View
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() =>
                          router.push("/investigations/candidates")
                        }
                      >
                        View candidates
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {canTriage && (
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Optional dismiss reason"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
            )}
          </div>
        )}

        {canTriage && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              disabled={pending}
              onClick={() => {
                setTitle(handoff.createDefaults.title);
                setSeverity(handoff.createDefaults.severity);
                setInheritOwner(false);
                setShowCreate(true);
                setShowLink(false);
              }}
            >
              Create Investigation
            </Button>
            <Button
              variant="secondary"
              disabled={pending || handoff.linkable.length === 0}
              title={
                handoff.linkable.length === 0
                  ? "No linkable open investigations for this client scope"
                  : undefined
              }
              onClick={() => {
                setShowLink(true);
                setShowCreate(false);
                setSelectedGroupId(handoff.linkable[0]?.id ?? "");
              }}
            >
              Link Existing Investigation
            </Button>
          </div>
        )}

        {showCreate && canTriage && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="font-medium text-foreground">Create investigation</p>
            <label className="block text-xs text-muted">
              Title
              <input
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted">
              Severity
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={severity}
                onChange={(e) =>
                  setSeverity(
                    e.target.value as typeof handoff.createDefaults.severity
                  )
                }
              >
                {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {handoff.suggestedOwner && (
              <label className="flex items-start gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={inheritOwner}
                  onChange={(e) => setInheritOwner(e.target.checked)}
                />
                <span>
                  Assign investigation to Attention claim holder{" "}
                  <span className="text-foreground">
                    {handoff.suggestedOwner.name}
                  </span>{" "}
                  (optional — never applied unless checked; does not overwrite
                  an existing assignee)
                </span>
              </label>
            )}
            <div className="flex gap-2">
              <Button
                disabled={pending || !title.trim()}
                onClick={() =>
                  run(
                    () =>
                      createInvestigationFromSecurityEventAction({
                        securityEventId,
                        title: title.trim(),
                        severity,
                        inheritOwner,
                      }),
                    { navigateToInvestigation: true }
                  )
                }
              >
                Create &amp; open
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {showLink && canTriage && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="font-medium text-foreground">
              Link existing investigation
            </p>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Filter by title or status"
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
            />
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {filteredLinkable.length === 0 && (
                <option value="">No matching investigations</option>
              )}
              {filteredLinkable.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} ({g.status})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              Already-linked investigations are excluded. Dismissed/closed
              cannot be linked.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending || !selectedGroupId}
                onClick={() =>
                  run(
                    () =>
                      linkSecurityEventToInvestigationAction({
                        securityEventId,
                        investigationId: selectedGroupId,
                      }),
                    { navigateToInvestigation: true }
                  )
                }
              >
                Link &amp; open
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setShowLink(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
