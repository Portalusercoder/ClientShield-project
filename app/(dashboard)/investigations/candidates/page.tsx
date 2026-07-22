/**
 * Candidate review page for ANALYST+.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  acceptCandidateAction,
  rejectCandidateAction,
} from "@/app/(dashboard)/investigations/actions";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listPendingCandidates } from "@/services/investigations/correlation.service";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Correlation Candidates" };

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export default async function CorrelationCandidatesPage() {
  const session = await requireSession();
  const canAct = hasMinimumRole(session, "ANALYST");
  const { items, total } = await listPendingCandidates(session.organizationId, {
    page: 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Correlation Candidates
        </h1>
        <p className="mt-1 text-sm text-muted">
          Review pending cross-event correlations before grouping into
          investigations. Accepting does not auto-confirm related activity.
        </p>
        <p className="mt-2 text-sm text-muted">
          <Link href="/investigations" className="text-accent hover:underline">
            ← Back to investigations
          </Link>
        </p>
      </div>

      <p className="text-sm text-muted">{total} pending candidate(s)</p>

      {items.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
          No pending correlation candidates.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((c) => {
            const reasons = asStringArray(c.reasons);
            const families = asStringArray(c.signalFamilies);
            return (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {c.confidence} · score {c.score}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Created {formatDateTime(c.createdAt)}
                      {c.expiresAt
                        ? ` · expires ${formatDateTime(c.expiresAt)}`
                        : ""}
                    </p>
                  </div>
                  {canAct ? (
                    <div className="flex gap-2">
                      <form
                        action={async (fd) => {
                          "use server";
                          await acceptCandidateAction(fd);
                        }}
                      >
                        <input type="hidden" name="candidateId" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-xs text-accent"
                        >
                          Accept
                        </button>
                      </form>
                      <form
                        action={async (fd) => {
                          "use server";
                          await rejectCandidateAction(fd);
                        }}
                      >
                        <input type="hidden" name="candidateId" value={c.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Reject reason (optional)"
                          className="mr-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="text-sm">
                    <p className="text-xs uppercase text-muted">Event A</p>
                    <Link
                      href={`/security-events/${c.eventAId}`}
                      className="text-accent hover:underline"
                    >
                      {c.eventA.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {c.eventA.severity}
                      {c.eventA.ruleId ? ` · rule ${c.eventA.ruleId}` : ""}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs uppercase text-muted">Event B</p>
                    <Link
                      href={`/security-events/${c.eventBId}`}
                      className="text-accent hover:underline"
                    >
                      {c.eventB.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {c.eventB.severity}
                      {c.eventB.ruleId ? ` · rule ${c.eventB.ruleId}` : ""}
                    </p>
                  </div>
                </div>
                {families.length > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    Families: {families.join(", ")}
                  </p>
                ) : null}
                {reasons.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
