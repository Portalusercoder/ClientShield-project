"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  mapEnrollmentAction,
  prepareEnrollmentAction,
  revokeEnrollmentAction,
  verifyEnrollmentAction,
} from "@/app/(dashboard)/assets/enrollment-actions";
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
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildEnrollmentInstructions } from "@/lib/wazuh/enrollment-instructions";
import type {
  EndpointWazuhReadiness,
  EnrollmentInstructions,
  WazuhAgentEnrollmentRecord,
} from "@/types/wazuh-enrollment";

const OPEN_STATUSES = new Set([
  "PENDING",
  "READY",
  "ENROLLING",
  "ENROLLED",
  "VERIFIED",
]);

export interface EndpointEnrollmentPanelProps {
  assetId: string;
  assetName: string;
  /** Preferred hostname seed for the prepare form. */
  defaultHostname?: string | null;
  authorizationStatus: string;
  canManage: boolean;
  enrollments: WazuhAgentEnrollmentRecord[];
  readiness: EndpointWazuhReadiness | null;
}

export function EndpointEnrollmentPanel({
  assetId,
  assetName,
  defaultHostname,
  authorizationStatus,
  canManage,
  enrollments,
  readiness,
}: EndpointEnrollmentPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRemap, setConfirmRemap] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const authorized = authorizationStatus === "AUTHORIZED";
  const hostnameSeed =
    defaultHostname?.replace(/\.$/, "") ||
    assetName.replace(/\s+/g, "-").toLowerCase();

  const [agentName, setAgentName] = useState(hostnameSeed);
  const [expectedHostname, setExpectedHostname] = useState(
    defaultHostname?.replace(/\.$/, "") || ""
  );
  const [platform, setPlatform] = useState<"MACOS" | "WINDOWS" | "LINUX">(
    "MACOS"
  );
  const [architecture, setArchitecture] = useState<"ARM64" | "X64">("ARM64");
  const [connectionHint, setConnectionHint] = useState("");

  const activeEnrollment = useMemo(
    () => enrollments.find((e) => OPEN_STATUSES.has(e.status)) ?? null,
    [enrollments]
  );

  const instructions: EnrollmentInstructions | null = useMemo(() => {
    if (!activeEnrollment) return null;
    return buildEnrollmentInstructions({
      platform: activeEnrollment.platform,
      architecture: activeEnrollment.architecture,
      agentName: activeEnrollment.agentName,
      expectedHostname: activeEnrollment.expectedHostname,
    });
  }, [activeEnrollment]);

  const canPrepare =
    canManage && authorized && !activeEnrollment && !readiness?.mappedAgentId;

  function refresh() {
    router.refresh();
  }

  function handlePrepare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    fd.set("assetId", assetId);
    startTransition(async () => {
      const result = await prepareEnrollmentAction(fd);
      if (!result.success) {
        setError(result.error ?? "Failed to prepare enrollment");
        return;
      }
      setMessage("Enrollment prepared. Follow the install steps, then Verify.");
      refresh();
    });
  }

  function handleVerify() {
    if (!activeEnrollment) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await verifyEnrollmentAction(activeEnrollment.id);
      if (!result.success) {
        setError(result.error ?? "Verification failed");
        return;
      }
      setMessage(result.data?.message ?? "Verification complete");
      refresh();
    });
  }

  function handleMap() {
    if (!activeEnrollment?.wazuhAgentId) {
      setError("Verify enrollment first so a Wazuh agent ID is available.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await mapEnrollmentAction({
        enrollmentId: activeEnrollment.id,
        wazuhAgentId: activeEnrollment.wazuhAgentId!,
        confirmRemap,
      });
      if (!result.success) {
        setError(result.error ?? "Mapping failed");
        return;
      }
      setMessage(
        `Agent ${activeEnrollment.wazuhAgentId} mapped to this asset.`
      );
      setConfirmRemap(false);
      refresh();
    });
  }

  function handleRevoke(deactivateMapping: boolean) {
    if (!activeEnrollment) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await revokeEnrollmentAction(activeEnrollment.id, {
        deactivateMapping,
      });
      if (!result.success) {
        setError(result.error ?? "Revoke failed");
        return;
      }
      setMessage(
        "Enrollment revoked. Wazuh agent was not deleted automatically."
      );
      setShowRevokeConfirm(false);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Endpoint Wazuh readiness</CardTitle>
          <CardDescription>
            Remote enrollment for WORKSTATION/SERVER assets. Secrets are never
            stored in ClientShield.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <StatusLine
            label="Display status"
            value={readiness?.displayStatus ?? "NOT_CONFIGURED"}
          />
          <StatusLine
            label="Enrollment"
            value={readiness?.enrollmentStatus ?? "—"}
          />
          <StatusLine
            label="Mapped agent"
            value={readiness?.mappedAgentId ?? "—"}
          />
          <StatusLine
            label="Live agent status"
            value={readiness?.agentLiveStatus ?? "—"}
          />
          {readiness?.message && (
            <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-muted">
              {readiness.message}
            </p>
          )}
          {!authorized && (
            <p className="rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-severity-medium">
              Asset must be AUTHORIZED before preparing remote enrollment.
            </p>
          )}
        </CardContent>
      </Card>

      {activeEnrollment?.hostnameMismatch && (
        <div
          className="rounded-md border border-severity-high/40 bg-severity-high/10 px-4 py-3 text-sm text-severity-high"
          role="alert"
        >
          <p className="font-medium">Hostname mismatch</p>
          <p className="mt-1">
            Expected{" "}
            <span className="font-mono">
              {activeEnrollment.expectedHostname}
            </span>
            {activeEnrollment.observedHostname
              ? `, observed ${activeEnrollment.observedHostname}`
              : ""}
            . Review before mapping.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </div>
      )}

      {canPrepare && (
        <Card>
          <CardHeader>
            <CardTitle>Prepare enrollment</CardTitle>
            <CardDescription>
              Creates an enrollment request and install instructions. Does not
              issue Wazuh secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handlePrepare}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Input
                label="Agent name"
                name="agentName"
                required
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="endpoint-hostname"
              />
              <Input
                label="Expected hostname"
                name="expectedHostname"
                required
                value={expectedHostname}
                onChange={(e) => setExpectedHostname(e.target.value)}
                placeholder="host.example.local"
              />
              <Select
                label="Platform"
                name="platform"
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value as "MACOS" | "WINDOWS" | "LINUX")
                }
                options={[
                  { value: "MACOS", label: "macOS" },
                  { value: "WINDOWS", label: "Windows" },
                  { value: "LINUX", label: "Linux" },
                ]}
              />
              <Select
                label="Architecture"
                name="architecture"
                value={architecture}
                onChange={(e) =>
                  setArchitecture(e.target.value as "ARM64" | "X64")
                }
                options={[
                  { value: "ARM64", label: "ARM64" },
                  { value: "X64", label: "X64" },
                ]}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Connection hint (optional, non-secret)"
                  name="connectionHint"
                  value={connectionHint}
                  onChange={(e) => setConnectionHint(e.target.value)}
                  placeholder="e.g. Tailscale overlay — manager on VPN IP"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Preparing…" : "Prepare enrollment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeEnrollment && instructions && (
        <Card>
          <CardHeader>
            <CardTitle>{instructions.title}</CardTitle>
            <CardDescription>
              Status: {activeEnrollment.status} · Expires{" "}
              {formatDateTime(activeEnrollment.expiresAt)}
              {activeEnrollment.wazuhAgentId
                ? ` · Agent ${activeEnrollment.wazuhAgentId}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-md border border-severity-medium/40 bg-severity-medium/10 px-4 py-3 text-sm text-severity-medium"
              role="alert"
            >
              <p className="font-semibold uppercase tracking-wide">Warning</p>
              <p className="mt-1">{instructions.warning}</p>
            </div>

            {activeEnrollment.connectionHint && (
              <p className="text-sm text-muted">
                Connection hint: {activeEnrollment.connectionHint}
              </p>
            )}

            <div>
              <h3 className="text-sm font-medium text-foreground">Steps</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                {instructions.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground">Commands</h3>
              <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-surface-elevated p-3 text-xs text-foreground">
                {instructions.commands.join("\n")}
              </pre>
            </div>

            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {instructions.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-muted">
              {instructions.secretHandlingTodo}
            </p>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  onClick={handleVerify}
                  disabled={pending}
                  variant="secondary"
                >
                  {pending ? "Working…" : "Verify"}
                </Button>
                <Button
                  onClick={handleMap}
                  disabled={
                    pending ||
                    !activeEnrollment.wazuhAgentId ||
                    (activeEnrollment.status !== "VERIFIED" &&
                      activeEnrollment.status !== "ENROLLED")
                  }
                >
                  Map to asset
                </Button>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={confirmRemap}
                    onChange={(e) => setConfirmRemap(e.target.checked)}
                  />
                  Confirm remap if agent already mapped elsewhere
                </label>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => setShowRevokeConfirm(true)}
                >
                  Revoke
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {enrollments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Enrollment history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Agent name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Wazuh ID</th>
                    <th className="px-3 py-2">Requested</th>
                    <th className="px-3 py-2">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {enrollments.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">{row.agentName}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{row.wazuhAgentId ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">
                        {formatDate(row.requestedAt)}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {formatDate(row.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showRevokeConfirm && activeEnrollment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Revoke enrollment?</CardTitle>
              <CardDescription>
                This marks the enrollment revoked. The Wazuh agent is not
                deleted automatically — remove it in Manager if required.
                Security events, findings, and incidents are preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setShowRevokeConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => handleRevoke(false)}
              >
                Revoke only
              </Button>
              {activeEnrollment.mappingId && (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => handleRevoke(true)}
                >
                  Revoke + deactivate mapping
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
