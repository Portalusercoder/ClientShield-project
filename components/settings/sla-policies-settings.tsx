"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  setSlaPolicyEnabledAction,
  upsertSlaPolicyAction,
} from "@/app/(dashboard)/settings/sla-actions";
import type { SlaPolicyRecord } from "@/types/sla";
import { SLA_DEFAULT_APPROACHING_PCT } from "@/types/sla";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ClientOption {
  id: string;
  name: string;
}

export function SlaPoliciesSettings({
  orgDefaults,
  clientOverrides,
  clients,
  canEdit,
}: {
  orgDefaults: SlaPolicyRecord[];
  clientOverrides: SlaPolicyRecord[];
  clients: ClientOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Request failed");
      else router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA Policies</CardTitle>
        <CardDescription>
          Contractual Incident response targets (HIGH/CRITICAL). Finding due
          dates remain separate overdue deadlines. No policy means no SLA
          breach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <PolicyGroup
          title="Organization defaults"
          description="Applied when no client override exists."
          policies={orgDefaults}
          clientId={null}
          canEdit={canEdit}
          pending={pending}
          onSave={(fd) => run(() => upsertSlaPolicyAction(fd))}
          onToggle={(policyId, enabled) =>
            run(() => setSlaPolicyEnabledAction({ policyId, enabled }))
          }
        />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Client overrides
          </h3>
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Client</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              disabled={!canEdit}
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {clientId ? (
            <PolicyGroup
              title={
                clients.find((c) => c.id === clientId)?.name ?? "Client"
              }
              description="Overrides organization defaults for this client."
              policies={clientOverrides.filter((p) => p.clientId === clientId)}
              clientId={clientId}
              canEdit={canEdit}
              pending={pending}
              onSave={(fd) => run(() => upsertSlaPolicyAction(fd))}
              onToggle={(policyId, enabled) =>
                run(() => setSlaPolicyEnabledAction({ policyId, enabled }))
              }
            />
          ) : (
            <p className="text-sm text-muted">
              Select a client to view or edit overrides.
            </p>
          )}
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted">
            Only ADMIN/OWNER can configure SLA policies.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PolicyGroup({
  title,
  description,
  policies,
  clientId,
  canEdit,
  pending,
  onSave,
  onToggle,
}: {
  title: string;
  description: string;
  policies: SlaPolicyRecord[];
  clientId: string | null;
  canEdit: boolean;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onToggle: (policyId: string, enabled: boolean) => void;
}) {
  const bySeverity = {
    CRITICAL: policies.find((p) => p.severity === "CRITICAL"),
    HIGH: policies.find((p) => p.severity === "HIGH"),
  } as const;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {(["CRITICAL", "HIGH"] as const).map((severity) => (
        <SeverityPolicyForm
          key={`${clientId ?? "org"}-${severity}`}
          severity={severity}
          existing={bySeverity[severity]}
          clientId={clientId}
          canEdit={canEdit}
          pending={pending}
          onSave={onSave}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function SeverityPolicyForm({
  severity,
  existing,
  clientId,
  canEdit,
  pending,
  onSave,
  onToggle,
}: {
  severity: "CRITICAL" | "HIGH";
  existing?: SlaPolicyRecord;
  clientId: string | null;
  canEdit: boolean;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onToggle: (policyId: string, enabled: boolean) => void;
}) {
  return (
    <form
      className="rounded-md border border-border p-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canEdit) return;
        onSave(new FormData(e.currentTarget));
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{severity}</p>
        <p className="text-xs text-muted">
          {existing
            ? existing.enabled
              ? existing.clientId
                ? "Client Override (enabled)"
                : "Organization Default (enabled)"
              : "Disabled"
            : "No Policy"}
        </p>
      </div>
      <input type="hidden" name="severity" value={severity} />
      <input type="hidden" name="clientId" value={clientId ?? "ORG"} />
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-muted">
          MTTA (min)
          <input
            name="mttaMinutes"
            type="number"
            min={1}
            max={525600}
            defaultValue={existing?.mttaMinutes ?? ""}
            disabled={!canEdit}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          MTTC (min)
          <input
            name="mttcMinutes"
            type="number"
            min={1}
            max={525600}
            defaultValue={existing?.mttcMinutes ?? ""}
            disabled={!canEdit}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          MTTR (min)
          <input
            name="mttrMinutes"
            type="number"
            min={1}
            max={525600}
            defaultValue={existing?.mttrMinutes ?? ""}
            disabled={!canEdit}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          Approaching %
          <input
            name="approachingThresholdPct"
            type="number"
            min={1}
            max={99}
            defaultValue={
              existing?.approachingThresholdPct ?? SLA_DEFAULT_APPROACHING_PCT
            }
            disabled={!canEdit}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={existing?.enabled ?? true}
          disabled={!canEdit}
        />
        Enabled
      </label>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            {existing ? "Update" : "Create"} {severity} policy
          </button>
          {existing ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
              onClick={() => onToggle(existing.id, !existing.enabled)}
            >
              {existing.enabled ? "Disable" : "Enable"}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
