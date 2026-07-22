"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignFindingAction,
  updateFindingStatusAction,
  updateFindingTriageAction,
} from "@/app/(dashboard)/vulnerabilities/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import type { FindingDetail } from "@/types/findings";
import type { FindingStatus } from "@prisma/client";

const PRIORITY_OPTIONS = [
  { value: "", label: "Unset (use recommendation)" },
  { value: "P1_CRITICAL", label: "P1 Critical" },
  { value: "P2_HIGH", label: "P2 High" },
  { value: "P3_MEDIUM", label: "P3 Medium" },
  { value: "P4_LOW", label: "P4 Low" },
  { value: "P5_INFORMATIONAL", label: "P5 Informational" },
];

interface FindingTriagePanelProps {
  finding: FindingDetail;
  users: { id: string; name: string | null; email: string }[];
  canManage: boolean;
  canAcceptRisk: boolean;
}

export function FindingTriagePanel({
  finding,
  users,
  canManage,
  canAcceptRisk,
}: FindingTriagePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [priority, setPriority] = useState(finding.triagePriority ?? "");
  const [businessImpact, setBusinessImpact] = useState(
    finding.businessImpact ?? ""
  );
  const [exploitability, setExploitability] = useState(
    finding.exploitabilityAssessment ?? ""
  );
  const [complexity, setComplexity] = useState(
    finding.remediationComplexity ?? ""
  );
  const [analystNotes, setAnalystNotes] = useState(finding.analystNotes ?? "");
  const [validationNotes, setValidationNotes] = useState(
    finding.validationNotes ?? ""
  );
  const [fpReason, setFpReason] = useState("");
  const [arReason, setArReason] = useState("");
  const [reviewDate, setReviewDate] = useState(
    finding.acceptedRiskReviewDate
      ? finding.acceptedRiskReviewDate.toISOString().slice(0, 10)
      : ""
  );
  const [resolveNote, setResolveNote] = useState("");
  const [assignee, setAssignee] = useState(finding.assignedToUserId ?? "");
  const [dueDate, setDueDate] = useState(
    finding.dueDate ? finding.dueDate.toISOString().slice(0, 10) : ""
  );

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        setMessage("Saved successfully.");
        router.refresh();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  function setStatus(status: FindingStatus, reason?: string) {
    run(async () => {
      const fd = new FormData();
      fd.set("status", status);
      if (reason) fd.set("reason", reason);
      if (validationNotes) fd.set("validationNotes", validationNotes);
      if (status === "ACCEPTED_RISK" && reviewDate) {
        fd.set("acceptedRiskReviewDate", new Date(reviewDate).toISOString());
      }
      return updateFindingStatusAction(finding.id, fd);
    });
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Triage</CardTitle>
          <CardDescription>Read-only for your role.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>Priority: {finding.triagePriority ?? "Not set"}</p>
          <p>Suggested: {finding.suggestedPriority} (recommendation)</p>
          <p>Business Impact: {finding.businessImpact ?? "—"}</p>
          <p>Analyst Notes: {finding.analystNotes ?? "—"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(error || message) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ?? message}
        </div>
      )}

      {finding.riskAcceptanceReviewDue && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Risk Acceptance Review Due — review date{" "}
          {finding.acceptedRiskReviewDate
            ? formatDate(finding.acceptedRiskReviewDate)
            : ""}{" "}
          has passed. Finding was not auto-reopened.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle Actions</CardTitle>
            <CardDescription>
              Status: {finding.status}. Scanner findings require analyst
              validation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {finding.status === "OPEN" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Validation notes</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                  />
                </div>
                <Button
                  disabled={isPending}
                  onClick={() => setStatus("VALIDATED")}
                >
                  Validate Finding
                </Button>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    False Positive reason *
                  </label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    value={fpReason}
                    onChange={(e) => setFpReason(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => setStatus("FALSE_POSITIVE", fpReason)}
                >
                  Mark False Positive
                </Button>
              </>
            )}

            {finding.status === "VALIDATED" && (
              <Button
                disabled={isPending}
                onClick={() => setStatus("IN_PROGRESS")}
              >
                Start Remediation (In Progress)
              </Button>
            )}

            {finding.status === "IN_PROGRESS" && (
              <>
                {(finding.source === "OWASP_ZAP" ||
                  finding.source === "MANUAL") && (
                  <p className="text-xs text-muted">
                    Manual verification required. Provide a resolution note.
                  </p>
                )}
                <textarea
                  className="min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Resolution note"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                />
                <Button
                  disabled={isPending}
                  onClick={() => setStatus("RESOLVED", resolveNote)}
                >
                  Mark Resolved
                </Button>
              </>
            )}

            {canAcceptRisk &&
              ["OPEN", "VALIDATED", "IN_PROGRESS"].includes(finding.status) && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-sm font-medium">Accept Risk (Admin)</p>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    placeholder="Accepted risk reason *"
                    value={arReason}
                    onChange={(e) => setArReason(e.target.value)}
                  />
                  <Input
                    label="Review / Expiration Date"
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => setStatus("ACCEPTED_RISK", arReason)}
                  >
                    Accept Risk
                  </Button>
                </div>
              )}

            {canAcceptRisk && finding.status === "ACCEPTED_RISK" && (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => setStatus("OPEN")}
              >
                Revoke Risk Acceptance
              </Button>
            )}

            {finding.status === "FALSE_POSITIVE" && (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => setStatus("OPEN")}
              >
                Reopen Finding
              </Button>
            )}

            {finding.validatedAt && (
              <p className="text-xs text-muted">
                Validated {formatDate(finding.validatedAt)}
                {finding.validatedByName
                  ? ` by ${finding.validatedByName}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessments & Priority</CardTitle>
            <CardDescription>
              Suggested priority:{" "}
              <span className="font-medium text-foreground">
                {finding.suggestedPriority}
              </span>{" "}
              (recommendation only — not applied until you set priority)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              label="Triage Priority"
              value={priority}
              options={PRIORITY_OPTIONS}
              onChange={(e) => setPriority(e.target.value)}
            />
            <Select
              label="Business Impact"
              value={businessImpact}
              options={[
                { value: "", label: "Unset" },
                { value: "LOW", label: "Low" },
                { value: "MODERATE", label: "Moderate" },
                { value: "HIGH", label: "High" },
                { value: "CRITICAL", label: "Critical" },
              ]}
              onChange={(e) => setBusinessImpact(e.target.value)}
            />
            <Select
              label="Exploitability"
              value={exploitability}
              options={[
                { value: "", label: "Unset" },
                { value: "UNLIKELY", label: "Unlikely" },
                { value: "POSSIBLE", label: "Possible" },
                { value: "LIKELY", label: "Likely" },
                { value: "UNKNOWN", label: "Unknown" },
              ]}
              onChange={(e) => setExploitability(e.target.value)}
            />
            <Select
              label="Remediation Complexity"
              value={complexity}
              options={[
                { value: "", label: "Unset" },
                { value: "LOW", label: "Low" },
                { value: "MEDIUM", label: "Medium" },
                { value: "HIGH", label: "High" },
                { value: "UNKNOWN", label: "Unknown" },
              ]}
              onChange={(e) => setComplexity(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Analyst Notes</label>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                value={analystNotes}
                onChange={(e) => setAnalystNotes(e.target.value)}
              />
            </div>
            <Button
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  fd.set("triagePriority", priority);
                  fd.set("businessImpact", businessImpact);
                  fd.set("exploitabilityAssessment", exploitability);
                  fd.set("remediationComplexity", complexity);
                  fd.set("analystNotes", analystNotes);
                  fd.set("validationNotes", validationNotes);
                  return updateFindingTriageAction(finding.id, fd);
                })
              }
            >
              Save Triage Assessments
            </Button>

            <hr className="border-border" />

            <Select
              label="Assign Analyst"
              value={assignee}
              options={[
                { value: "", label: "Unassigned" },
                ...users.map((u) => ({
                  value: u.id,
                  label: u.name ?? u.email,
                })),
              ]}
              onChange={(e) => setAssignee(e.target.value)}
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  fd.set("assignedToUserId", assignee);
                  fd.set("dueDate", dueDate);
                  return assignFindingAction(finding.id, fd);
                })
              }
            >
              Save Assignment
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
