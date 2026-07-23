"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  initializeWazuhFromNowAction,
  removeWazuhAgentMappingAction,
  syncWazuhNewEventsAction,
  upsertWazuhAgentMappingAction,
} from "@/app/(dashboard)/security-events/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/utils";
import type {
  WazuhAgentListItem,
  WazuhIntegrationStatus,
} from "@/types/security-events";

interface WazuhIntegrationClientProps {
  status: WazuhIntegrationStatus;
  agents: WazuhAgentListItem[];
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  canSync: boolean;
  canMapAgents: boolean;
}

export function WazuhIntegrationClient({
  status,
  agents,
  clients,
  assets,
  canSync,
  canMapAgents,
}: WazuhIntegrationClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInitConfirm, setShowInitConfirm] = useState(false);
  const [busyAction, setBusyAction] = useState<"init" | "sync" | null>(null);

  // Defensive defaults — avoids blank-page crashes if an older payload is cached.
  const autoSyncEnabled = status.autoSyncEnabled ?? false;
  const syncIntervalSeconds = status.syncIntervalSeconds ?? 60;
  const minEventLevel = status.minEventLevel ?? 4;
  const workerStatus = status.workerStatus ?? "not_detected";
  const processedLast24h = status.processedLast24h ?? 0;
  const createdLast24h = status.createdLast24h ?? 0;
  const correlatedLast24h = status.correlatedLast24h ?? 0;
  const filteredLast24h = status.filteredLast24h ?? 0;
  const ignoredLast24h = status.ignoredLast24h ?? 0;

  const runInitialize = () => {
    setMessage(null);
    setError(null);
    setBusyAction("init");
    startTransition(async () => {
      const result = await initializeWazuhFromNowAction();
      setBusyAction(null);
      setShowInitConfirm(false);
      if (!result.success) {
        setError(result.error ?? "Initialization failed");
        return;
      }
      const ts = result.data?.checkpointTimestamp
        ? formatDate(new Date(result.data.checkpointTimestamp))
        : "now";
      setMessage(
        `Ingestion initialized. Checkpoint set to ${ts}. Existing Wazuh alerts were not imported. Only newer alerts will be eligible for Sync New Events.`
      );
      router.refresh();
    });
  };

  const runSync = () => {
    setMessage(null);
    setError(null);
    setBusyAction("sync");
    startTransition(async () => {
      const result = await syncWazuhNewEventsAction();
      setBusyAction(null);
      if (!result.success) {
        setError(result.error ?? "Sync failed");
        return;
      }
      setMessage(
        `Sync complete: processed ${result.data?.processed ?? 0}, created ${result.data?.created ?? 0}, correlated ${result.data?.updated ?? 0}, filtered ${result.data?.filtered ?? 0}, ignored ${result.data?.ignored ?? 0}, duplicates skipped ${result.data?.skippedDuplicates ?? 0}.`
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Wazuh Integration
        </h1>
        <p className="mt-1 text-sm text-muted">
          Read-only integration status, controlled ingestion checkpoint, and
          analyst-confirmed asset mappings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Indexer</CardTitle>
            <CardDescription>Alert search (read-only)</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <StatusRow
              label="Connection"
              value={status.indexerConnected ? "Connected" : "Disconnected"}
              ok={status.indexerConnected}
            />
            {status.indexerStatus && (
              <StatusRow label="Cluster" value={status.indexerStatus} ok />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manager API</CardTitle>
            <CardDescription>Agent inventory (read-only)</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <StatusRow
              label="Connection"
              value={status.managerConnected ? "Connected" : "Disconnected"}
              ok={status.managerConnected}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automatic Sync</CardTitle>
          <CardDescription>
            Background worker polling (separate from the web process).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusRow
            label="Auto Sync"
            value={autoSyncEnabled ? "Enabled" : "Disabled"}
            ok={autoSyncEnabled}
          />
          <StatusRow
            label="Sync interval"
            value={`${syncIntervalSeconds}s`}
            ok
          />
          <StatusRow
            label="Min event level"
            value={String(minEventLevel)}
            ok
          />
          <StatusRow
            label="Worker Status"
            value={
              workerStatus === "running"
                ? "Running"
                : workerStatus === "stale"
                  ? "Stale"
                  : "Not Detected"
            }
            ok={workerStatus === "running"}
          />
          {status.workerLastHeartbeatAt && (
            <StatusRow
              label="Last Worker Heartbeat"
              value={formatDateTime(status.workerLastHeartbeatAt)}
              ok={workerStatus === "running"}
            />
          )}
          {status.nextExpectedSyncAt && (
            <StatusRow
              label="Next Expected Sync"
              value={formatDateTime(status.nextExpectedSyncAt)}
              ok
            />
          )}
          {!autoSyncEnabled && (
            <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-muted">
              Automatic synchronization is disabled. Manual synchronization
              remains available.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingestion Metrics</CardTitle>
          <CardDescription>
            Last sync counters and rolling 24h ledger totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusRow
            label="Last sync duration"
            value={
              status.lastSyncDurationMs != null
                ? `${status.lastSyncDurationMs} ms`
                : "—"
            }
            ok={status.lastSyncDurationMs != null}
          />
          <StatusRow
            label="Last sync processed"
            value={String(status.lastSyncProcessed ?? "—")}
            ok
          />
          <StatusRow
            label="Last sync created"
            value={String(status.lastSyncCreated ?? "—")}
            ok
          />
          <StatusRow
            label="Last sync correlated"
            value={String(status.lastSyncUpdated ?? "—")}
            ok
          />
          <StatusRow
            label="Last sync filtered"
            value={String(status.lastSyncFiltered ?? "—")}
            ok
          />
          <StatusRow
            label="Last sync ignored"
            value={String(status.lastSyncIgnored ?? "—")}
            ok
          />
          <StatusRow
            label="Processed (24h)"
            value={String(processedLast24h)}
            ok
          />
          <StatusRow
            label="Events created (24h)"
            value={String(createdLast24h)}
            ok
          />
          <StatusRow
            label="Correlated alerts (24h)"
            value={String(correlatedLast24h)}
            ok
          />
          <StatusRow
            label="Filtered (24h)"
            value={String(filteredLast24h)}
            ok
          />
          <StatusRow
            label="Ignored / denylist (24h)"
            value={String(ignoredLast24h)}
            ok
          />
          <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-muted">
            Filtered = below minimum Wazuh rule level (or allowlist miss).
            Ignored = explicitly denied by policy. Noisy / Informational /
            Actionable are classifications on ingested Security Events.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingestion Checkpoint</CardTitle>
          <CardDescription>
            Initialize without importing history, then sync only newer alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusRow
            label="Integration enabled"
            value={status.enabled ? "Yes" : "No"}
            ok={status.enabled}
          />
          <StatusRow
            label="Organization match"
            value={status.organizationMatches ? "Yes" : "No"}
            ok={status.organizationMatches}
          />
          <StatusRow
            label="Checkpoint status"
            value={
              status.checkpointInitialized ? "Initialized" : "Not initialized"
            }
            ok={status.checkpointInitialized}
          />
          <StatusRow
            label="Checkpoint timestamp"
            value={
              status.checkpointTimestamp
                ? formatDateTime(status.checkpointTimestamp)
                : "—"
            }
            ok={Boolean(status.checkpointTimestamp)}
          />
          <StatusRow
            label="Last Successful Sync"
            value={
              status.lastSuccessfulSyncAt
                ? formatDateTime(status.lastSuccessfulSyncAt)
                : "Never"
            }
            ok={Boolean(status.lastSuccessfulSyncAt)}
          />
          {status.lastAttemptAt && (
            <StatusRow
              label="Last Attempt"
              value={formatDateTime(status.lastAttemptAt)}
              ok
            />
          )}
          {status.lastError && (
            <p className="rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-severity-medium">
              {status.lastError}
            </p>
          )}

          {canSync && status.enabled && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setShowInitConfirm(true);
                }}
              >
                {busyAction === "init" ? "Initializing…" : "Initialize From Now"}
              </Button>
              <Button
                variant="secondary"
                disabled={pending || !status.checkpointInitialized}
                title={
                  !status.checkpointInitialized
                    ? "Initialize the checkpoint first"
                    : undefined
                }
                onClick={runSync}
              >
                {busyAction === "sync" ? "Syncing…" : "Sync New Events"}
              </Button>
            </div>
          )}

          {!canSync && status.enabled && (
            <p className="text-xs text-muted">
              Sync actions require ANALYST role or higher.
            </p>
          )}

          {showInitConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wazuh-init-title"
            >
              <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
                <h2
                  id="wazuh-init-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Initialize ingestion from now?
                </h2>
                <div className="mt-3 space-y-2 text-sm text-muted">
                  <p>
                    This sets the ClientShield ingestion checkpoint to the
                    current/latest Wazuh alert position.
                  </p>
                  <p className="font-medium text-severity-medium">
                    Existing Wazuh alerts will be skipped. No historical alerts
                    will be imported. Only new alerts generated after
                    initialization will be eligible for future ingestion.
                  </p>
                  <p>
                    Wazuh data is not modified. No Security Events or Incidents
                    are created by this action.
                  </p>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setShowInitConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={pending} onClick={runInitialize}>
                    {busyAction === "init"
                      ? "Initializing…"
                      : "Confirm Initialize"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {message && <p className="text-success">{message}</p>}
          {error && <p className="text-severity-critical">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wazuh Agents</CardTitle>
          <CardDescription>
            Map agents to ClientShield assets. Agent 000 (wazuh.manager) is
            MANAGER — NOT MAPPABLE. Prefer enrollment workflow for remote
            endpoints. Keepalive and enrollment status are shown when available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted">
              No agents available or integration is not configured for this
              organization.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">Agent ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">OS</th>
                    <th className="px-3 py-2">Last Keep Alive</th>
                    <th className="px-3 py-2">Mapped Client</th>
                    <th className="px-3 py-2">Mapped Asset</th>
                    <th className="px-3 py-2">Enrollment</th>
                    {canMapAgents && <th className="px-3 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agents.map((agent) => (
                    <tr key={agent.id}>
                      <td className="px-3 py-2">{agent.id}</td>
                      <td className="px-3 py-2">{agent.name}</td>
                      <td className="px-3 py-2">
                        <InventoryRoleBadge agent={agent} />
                      </td>
                      <td className="px-3 py-2">
                        <MappingStatusLabel agent={agent} />
                        <span className="ml-2 text-xs text-muted">
                          ({agent.status})
                        </span>
                      </td>
                      <td className="px-3 py-2">{agent.ip ?? "—"}</td>
                      <td className="px-3 py-2">{agent.os ?? "—"}</td>
                      <td className="px-3 py-2">
                        {agent.lastKeepAlive
                          ? formatDateTime(new Date(agent.lastKeepAlive))
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {agent.mappedClientName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {agent.mappedAssetName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {agent.enrollmentStatus ?? "—"}
                      </td>
                      {canMapAgents && (
                        <td className="px-3 py-2">
                          {agent.id === "000" || agent.mappable === false ? (
                            <span className="text-xs text-muted">
                              Manager — not mappable
                            </span>
                          ) : (
                            <AgentMappingForm
                              agent={agent}
                              clients={clients}
                              assets={assets}
                              disabled={pending}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted">{label}</span>
      <span className={ok ? "text-success" : "text-severity-medium"}>
        {value}
      </span>
    </div>
  );
}

function InventoryRoleBadge({ agent }: { agent: WazuhAgentListItem }) {
  const role = agent.inventoryRole;
  if (agent.id === "000" || role === "MANAGER") {
    return (
      <span className="inline-flex rounded border border-border bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Manager — not mappable
      </span>
    );
  }
  if (role === "MAPPED_ENDPOINT") {
    return (
      <span className="inline-flex rounded border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
        Mapped
      </span>
    );
  }
  if (role === "DISCONNECTED_ENDPOINT") {
    return (
      <span className="inline-flex rounded border border-severity-medium/30 bg-severity-medium/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-severity-medium">
        Disconnected
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-border bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      Unmapped
    </span>
  );
}

function MappingStatusLabel({ agent }: { agent: WazuhAgentListItem }) {
  if (agent.id === "000" || agent.mappable === false) {
    return <span className="text-xs text-muted">NOT MAPPABLE</span>;
  }
  if (agent.inventoryRole === "MAPPED_ENDPOINT" || agent.mappingId) {
    if (agent.inventoryRole === "DISCONNECTED_ENDPOINT") {
      return <span className="text-severity-medium">DISCONNECTED</span>;
    }
    return <span className="text-success">MAPPED</span>;
  }
  if (agent.inventoryRole === "DISCONNECTED_ENDPOINT") {
    return <span className="text-severity-medium">DISCONNECTED</span>;
  }
  return <span className="text-muted">UNMAPPED</span>;
}

function AgentMappingForm({
  agent,
  clients,
  assets,
  disabled,
}: {
  agent: WazuhAgentListItem;
  clients: { id: string; name: string }[];
  assets: { id: string; name: string; clientId: string }[];
  disabled: boolean;
}) {
  const [clientId, setClientId] = useState(agent.mappedClientId ?? "");
  const filteredAssets = assets.filter(
    (a) => !clientId || a.clientId === clientId
  );

  return (
    <form
      action={async (fd) => {
        await upsertWazuhAgentMappingAction(fd);
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="wazuhAgentId" value={agent.id} />
      <input type="hidden" name="wazuhAgentName" value={agent.name} />
      <select
        name="clientId"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs"
        required
      >
        <option value="">Client…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="assetId"
        defaultValue={agent.mappedAssetId ?? ""}
        className="rounded border border-border bg-background px-2 py-1 text-xs"
        required
      >
        <option value="">Asset…</option>
        {filteredAssets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={disabled}>
        Map
      </Button>
      {agent.mappingId && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => removeWazuhAgentMappingAction(agent.id)}
        >
          Unmap
        </Button>
      )}
    </form>
  );
}
