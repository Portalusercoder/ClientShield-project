"use client";

import { useState, useTransition } from "react";
import {
  createAssetAction,
  updateAssetAction,
} from "@/app/(dashboard)/assets/actions";
import {
  ENV_LABELS,
  TYPE_LABELS,
} from "@/components/assets/asset-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type { AssetDetail } from "@/types/asset";
import type { AssetClientOption } from "@/types/asset";

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const ENV_OPTIONS = Object.entries(ENV_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const CRITICALITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const MONITORING_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "INACTIVE", label: "Inactive" },
];

const AUTH_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "AUTHORIZED", label: "Authorized" },
  { value: "NOT_AUTHORIZED", label: "Not Authorized" },
];

interface AssetFormModalProps {
  open: boolean;
  onClose: () => void;
  clients: AssetClientOption[];
  asset?: AssetDetail;
  /** Preselect client when opening from client detail page */
  defaultClientId?: string;
  onSuccess?: (assetId: string) => void;
}

export function AssetFormModal({
  open,
  onClose,
  clients,
  asset,
  defaultClientId,
  onSuccess,
}: AssetFormModalProps) {
  const isEditing = Boolean(asset);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateAssetAction(asset!.id, formData)
        : await createAssetAction(formData);

      if (result.success) {
        onSuccess?.(result.data.id);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Asset" : "Add Asset"}
      description={
        isEditing
          ? "Update asset information. Authorization changes are audited."
          : "Register a digital asset for security monitoring. Active scanning is not enabled yet."
      }
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Select
          label="Client"
          name="clientId"
          required
          defaultValue={asset?.clientId ?? defaultClientId ?? clientOptions[0]?.value}
          options={clientOptions}
          disabled={isPending || clientOptions.length === 0}
        />

        <Input
          label="Asset Name"
          name="name"
          required
          defaultValue={asset?.name}
          placeholder="Production Website"
          disabled={isPending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Asset Type"
            name="type"
            defaultValue={asset?.type ?? "WEBSITE"}
            options={TYPE_OPTIONS}
            disabled={isPending}
          />
          <Input
            label="URL or Hostname"
            name="location"
            required
            defaultValue={asset?.location === "—" ? "" : asset?.location}
            placeholder="example.com"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Environment"
            name="environment"
            defaultValue={asset?.environment ?? "PRODUCTION"}
            options={ENV_OPTIONS}
            disabled={isPending}
          />
          <Select
            label="Criticality"
            name="criticality"
            defaultValue={asset?.criticality ?? "MEDIUM"}
            options={CRITICALITY_OPTIONS}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Monitoring Status"
            name="monitoringStatus"
            defaultValue={asset?.monitoringStatus ?? "ACTIVE"}
            options={MONITORING_OPTIONS}
            disabled={isPending}
          />
          <Select
            label="Authorization Status"
            name="authorizationStatus"
            defaultValue={asset?.authorizationStatus ?? "PENDING"}
            options={AUTH_OPTIONS}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={asset?.description ?? ""}
            disabled={isPending}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            placeholder="Optional notes about this asset"
          />
        </div>

        <p className="text-xs text-muted">
          Active security testing is not implemented yet. Authorization status
          is informational until scanning is enabled.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || clientOptions.length === 0}>
            {isPending
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save Changes"
                : "Add Asset"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
