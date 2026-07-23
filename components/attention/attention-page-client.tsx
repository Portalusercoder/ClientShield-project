"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { formatRelativeTime } from "@/lib/utils";
import type { AttentionItem, AttentionListResult, AttentionSnoozePreset } from "@/types/attention";
import { SeverityBadge } from "@/components/ui/badge";
import {
  acknowledgeAttentionAction,
  claimAttentionAction,
  clearAttentionSnoozeAction,
  releaseAttentionClaimAction,
  snoozeAttentionAction,
} from "@/app/(dashboard)/attention/actions";

const SOURCE_LABELS: Record<AttentionItem["sourceType"], string> = {
  SECURITY_EVENT: "Security Event",
  FINDING: "Finding",
  INVESTIGATION: "Investigation",
  INCIDENT: "Incident",
};

interface ClientOption {
  id: string;
  name: string;
}

interface AttentionPageClientProps {
  data: AttentionListResult;
  clients: ClientOption[];
  canMutate: boolean;
  canOverrideClaims: boolean;
  currentUserId: string;
  currentClientId: string;
  currentSourceType: string;
  currentSeverity: string;
  currentStatus: string;
  currentAttribution: string;
  currentOverdue: string;
  currentAcknowledgement: string;
  currentOwnership: string;
  currentSnooze: string;
}

function SelectFilter({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AttentionPageClient({
  data,
  clients,
  canMutate,
  canOverrideClaims,
  currentClientId,
  currentSourceType,
  currentSeverity,
  currentStatus,
  currentAttribution,
  currentOverdue,
  currentAcknowledgement,
  currentOwnership,
  currentSnooze,
}: AttentionPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const updateFilter = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === "ALL" || (name === "snooze" && value === "ACTIVE")) {
        if (name === "snooze" && value === "ACTIVE") params.delete(name);
        else if (value === "ALL") params.delete(name);
        else params.set(name, value);
      } else {
        params.set(name, value);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  const goPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setActionError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setActionError(result.error ?? "Action failed");
      else router.refresh();
    });
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <SelectFilter
          label="Client"
          name="clientId"
          value={currentClientId}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All clients" },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <SelectFilter
          label="Source"
          name="sourceType"
          value={currentSourceType}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All sources" },
            { value: "INCIDENT", label: "Incidents" },
            { value: "INVESTIGATION", label: "Investigations" },
            { value: "SECURITY_EVENT", label: "Security Events" },
            { value: "FINDING", label: "Findings" },
          ]}
        />
        <SelectFilter
          label="Severity"
          name="severity"
          value={currentSeverity}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All" },
            { value: "CRITICAL", label: "Critical" },
            { value: "HIGH", label: "High" },
          ]}
        />
        <SelectFilter
          label="Status"
          name="status"
          value={currentStatus}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All statuses" },
            { value: "NEW", label: "NEW" },
            { value: "REVIEWING", label: "REVIEWING" },
            { value: "OPEN", label: "OPEN" },
            { value: "VALIDATED", label: "VALIDATED" },
            { value: "IN_PROGRESS", label: "IN_PROGRESS" },
            { value: "INVESTIGATING", label: "INVESTIGATING" },
            { value: "CONFIRMED", label: "CONFIRMED" },
            { value: "ACKNOWLEDGED", label: "ACKNOWLEDGED" },
            { value: "CONTAINED", label: "CONTAINED" },
            { value: "ERADICATED", label: "ERADICATED" },
            { value: "RECOVERING", label: "RECOVERING" },
          ]}
        />
        <SelectFilter
          label="Attribution"
          name="attribution"
          value={currentAttribution}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All" },
            { value: "ATTRIBUTED", label: "Attributed" },
            { value: "UNATTRIBUTED", label: "Unattributed" },
          ]}
        />
        <SelectFilter
          label="Overdue"
          name="overdue"
          value={currentOverdue}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All" },
            { value: "OVERDUE", label: "Overdue only" },
          ]}
        />
        <SelectFilter
          label="Acknowledgement"
          name="acknowledgement"
          value={currentAcknowledgement}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All" },
            { value: "UNACKNOWLEDGED", label: "Unacknowledged" },
            { value: "ACKNOWLEDGED", label: "Acknowledged" },
          ]}
        />
        <SelectFilter
          label="Ownership"
          name="ownership"
          value={currentOwnership}
          onChange={updateFilter}
          options={[
            { value: "ALL", label: "All" },
            { value: "UNCLAIMED", label: "Unclaimed" },
            { value: "MINE", label: "Mine" },
          ]}
        />
        <SelectFilter
          label="Snooze"
          name="snooze"
          value={currentSnooze}
          onChange={updateFilter}
          options={[
            { value: "ACTIVE", label: "Hide my snoozed" },
            { value: "SNOOZED", label: "My snoozed only" },
            { value: "ALL", label: "Include snoozed" },
          ]}
        />
      </div>

      {actionError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>
          {data.total} item{data.total === 1 ? "" : "s"} needing attention
          {data.truncated ? (
            <span className="ml-2 text-warning">
              (results bounded at {data.perSourceBound} per source)
            </span>
          ) : null}
        </p>
        <p>
          Page {data.page} of {totalPages}
        </p>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-md border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No attention items match the current filters.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {data.items.map((item) => (
            <AttentionRow
              key={item.key}
              item={item}
              canMutate={canMutate}
              canOverrideClaims={canOverrideClaims}
              onAction={runAction}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => goPage(data.page - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={data.page >= totalPages}
            onClick={() => goPage(data.page + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AttentionRow({
  item,
  canMutate,
  canOverrideClaims,
  onAction,
}: {
  item: AttentionItem;
  canMutate: boolean;
  canOverrideClaims: boolean;
  onAction: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const snooze = (preset: AttentionSnoozePreset, customUntil?: Date) => {
    if (item.severity === "CRITICAL") {
      const ok = window.confirm(
        "Snooze this CRITICAL item for you only? It will remain visible to other analysts and in team dashboard counts."
      );
      if (!ok) return;
    }
    onAction(() =>
      snoozeAttentionAction({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        preset,
        customUntilIso: customUntil?.toISOString(),
        criticalConfirmed: item.severity === "CRITICAL",
        severity: item.severity,
      })
    );
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {SOURCE_LABELS[item.sourceType]}
            </span>
            <SeverityBadge severity={item.severity} />
            {item.overdue ? (
              <span className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
                Overdue
              </span>
            ) : null}
            {item.acknowledged ? (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Acknowledged
              </span>
            ) : null}
            {item.isSnoozedForCurrentUser ? (
              <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                Snoozed
              </span>
            ) : null}
            <span className="text-xs text-muted">{item.sourceStatus}</span>
          </div>
          <Link
            href={item.href}
            className="block text-sm font-medium text-foreground hover:text-accent"
          >
            {item.title}
          </Link>
          <p className="text-xs text-muted">
            {item.isUnattributed ? (
              <span className="font-medium text-warning">Unattributed</span>
            ) : (
              item.clientName ?? "—"
            )}
            {item.assetName ? ` · ${item.assetName}` : ""}
            {item.ownerName
              ? ` · Claimed by: ${item.ownerName}`
              : " · Unclaimed"}
          </p>
          {item.acknowledged && item.acknowledgedAt ? (
            <p className="text-xs text-muted">
              Acknowledged by {item.acknowledgedByName ?? "analyst"} at{" "}
              {item.acknowledgedAt.toISOString().replace("T", " ").slice(0, 19)}{" "}
              UTC
            </p>
          ) : null}
          {item.isSnoozedForCurrentUser && item.snoozedUntil ? (
            <p className="text-xs text-warning">
              Snoozed until{" "}
              {item.snoozedUntil.toISOString().replace("T", " ").slice(0, 16)}{" "}
              UTC
            </p>
          ) : null}
          <ul className="flex flex-wrap gap-1.5">
            {item.reasons.map((reason) => (
              <li
                key={reason}
                className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] text-muted"
              >
                {reason}
              </li>
            ))}
          </ul>
          {canMutate ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {!item.acknowledged ? (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                  onClick={() =>
                    onAction(() =>
                      acknowledgeAttentionAction({
                        sourceType: item.sourceType,
                        sourceId: item.sourceId,
                      })
                    )
                  }
                >
                  Acknowledge
                </button>
              ) : null}
              {!item.isClaimed ? (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                  onClick={() =>
                    onAction(() =>
                      claimAttentionAction({
                        sourceType: item.sourceType,
                        sourceId: item.sourceId,
                      })
                    )
                  }
                >
                  Claim
                </button>
              ) : item.isMine || canOverrideClaims ? (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                  onClick={() =>
                    onAction(() =>
                      releaseAttentionClaimAction({
                        sourceType: item.sourceType,
                        sourceId: item.sourceId,
                      })
                    )
                  }
                >
                  {item.isMine ? "Release" : "Release (admin)"}
                </button>
              ) : null}
              {!item.isSnoozedForCurrentUser ? (
                <>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                    onClick={() => snooze("MINUTES_15")}
                  >
                    Snooze 15m
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                    onClick={() => snooze("HOUR_1")}
                  >
                    Snooze 1h
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                    onClick={() => snooze("HOURS_4")}
                  >
                    Snooze 4h
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                    onClick={() => snooze("UNTIL_TOMORROW")}
                  >
                    Until tomorrow
                  </button>
                  <label className="inline-flex items-center gap-1 text-xs text-muted">
                    <span className="sr-only">Custom snooze</span>
                    <input
                      type="datetime-local"
                      className="rounded border border-border bg-surface px-1 py-0.5 text-xs text-foreground"
                      title="Custom snooze (max 7 days)"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const customUntil = new Date(v);
                        snooze("CUSTOM", customUntil);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
                  onClick={() =>
                    onAction(() =>
                      clearAttentionSnoozeAction({
                        sourceType: item.sourceType,
                        sourceId: item.sourceId,
                      })
                    )
                  }
                >
                  Clear snooze
                </button>
              )}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <p>{formatRelativeTime(item.waitingSince)}</p>
          {item.dueDate ? (
            <p className={item.overdue ? "text-danger" : ""}>
              Due {item.dueDate.toISOString().slice(0, 10)}
            </p>
          ) : null}
          <Link href={item.href} className="mt-1 inline-block text-accent hover:underline">
            Open →
          </Link>
        </div>
      </div>
    </li>
  );
}
