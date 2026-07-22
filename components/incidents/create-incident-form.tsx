"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createIncidentAction } from "@/app/(dashboard)/incidents/actions";
import { Button } from "@/components/ui/button";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const CATEGORIES = [
  "MALWARE",
  "PHISHING",
  "ACCOUNT_COMPROMISE",
  "UNAUTHORIZED_ACCESS",
  "BRUTE_FORCE",
  "DATA_EXPOSURE",
  "DATA_EXFILTRATION",
  "WEB_ATTACK",
  "DENIAL_OF_SERVICE",
  "VULNERABILITY_EXPLOITATION",
  "SUSPICIOUS_ACTIVITY",
  "POLICY_VIOLATION",
  "IOT_SECURITY",
  "OTHER",
] as const;

interface CreateIncidentFormProps {
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  users: { id: string; name: string | null; email: string }[];
  defaultClientId?: string;
  defaultAssetId?: string;
  onClose?: () => void;
}

export function CreateIncidentForm({
  clients,
  assets,
  users,
  defaultClientId,
  defaultAssetId,
  onClose,
}: CreateIncidentFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredAssets = clientId
    ? assets.filter((a) => a.clientId === clientId)
    : assets;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createIncidentAction(formData);
          if (result.success) {
            onClose?.();
            router.push(`/incidents/${result.data.id}`);
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Client *</span>
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Asset</span>
          <select
            name="assetId"
            defaultValue={defaultAssetId ?? ""}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">None</option>
            {filteredAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Title *</span>
        <input
          name="title"
          required
          maxLength={300}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="Brief incident title"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Description *</span>
        <textarea
          name="description"
          required
          rows={4}
          maxLength={5000}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          placeholder="What happened, scope, and initial observations"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Severity *</span>
          <select
            name="severity"
            required
            defaultValue="MEDIUM"
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Category *</span>
          <select
            name="category"
            required
            defaultValue="OTHER"
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Assigned analyst</span>
          <select
            name="assignedToUserId"
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Occurred at</span>
          <input
            type="datetime-local"
            name="occurredAt"
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Business impact</span>
          <textarea
            name="businessImpact"
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Technical impact</span>
          <textarea
            name="technicalImpact"
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
      </div>

      <input type="hidden" name="source" value="MANUAL" />
      <input type="hidden" name="detectionMethod" value="MANUAL" />

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create Incident"}
        </Button>
      </div>
    </form>
  );
}
