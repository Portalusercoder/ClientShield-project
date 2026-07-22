"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveAssetAction } from "@/app/(dashboard)/assets/actions";
import {
  AssetAuthorizationBadge,
  AssetCriticalityBadge,
  AssetEnvironmentBadge,
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import { RunSecurityCheckButton } from "@/components/assets/run-security-check-button";
import { RunZapBaselineButton } from "@/components/assets/run-zap-baseline-button";
import { SecurityChecksPanel } from "@/components/assets/security-checks-panel";
import { SecurityPostureCard } from "@/components/assets/security-posture-card";
import { PostureScoreBreakdownCard } from "@/components/scoring/posture-score-breakdown-card";
import { ZapScansPanel } from "@/components/assets/zap-scans-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { AssetClientOption, AssetDetail } from "@/types/asset";
import type {
  PostureStatus,
  SecurityCheckListItem,
} from "@/types/security-check";
import type { ZapScanListItem } from "@/types/zap";
import type { AssetPostureScoreResult } from "@/types/scoring";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";

type Tab =
  | "overview"
  | "security-checks"
  | "findings"
  | "incidents"
  | "security-events"
  | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "security-checks", label: "Security Checks" },
  { id: "findings", label: "Findings" },
  { id: "incidents", label: "Incidents" },
  { id: "security-events", label: "Security Events" },
  { id: "activity", label: "Activity" },
];

export interface AssetFindingItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  source?: string;
  code: string | null;
  instanceCount?: number;
  firstDetectedAt?: Date;
  lastDetectedAt?: Date;
  /** @deprecated use firstDetectedAt */
  createdAt?: Date;
}

interface AssetIncidentItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status:
    | "OPEN"
    | "ACKNOWLEDGED"
    | "INVESTIGATING"
    | "CONTAINED"
    | "ERADICATED"
    | "RECOVERING"
    | "RESOLVED"
    | "CLOSED";
  detectedAt: Date;
  assignedToName: string | null;
}

interface AssetSecurityEventItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status: string;
  agentName: string | null;
  occurrenceCount: number;
  lastSeenAt: Date;
  ruleId: string | null;
}

interface AssetDetailViewProps {
  asset: AssetDetail;
  clients: AssetClientOption[];
  canEdit: boolean;
  canArchive: boolean;
  canRunCheck: boolean;
  securityChecks: SecurityCheckListItem[];
  zapScans: ZapScanListItem[];
  findings: AssetFindingItem[];
  incidents: AssetIncidentItem[];
  securityEvents: AssetSecurityEventItem[];
  posture: {
    https: PostureStatus;
    tls: PostureStatus;
    headers: PostureStatus;
    cookies: PostureStatus;
  } | null;
  findingsPosture: AssetPostureScoreResult;
  passiveCheckScore?: number | null;
}

export function AssetDetailView({
  asset,
  clients,
  canEdit,
  canArchive,
  canRunCheck,
  securityChecks,
  zapScans,
  findings,
  incidents,
  securityEvents,
  posture,
  findingsPosture,
  passiveCheckScore,
}: AssetDetailViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const blockedReason = !canRunCheck
    ? getBlockedReason(asset)
    : null;

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveAssetAction(asset.id);
      if (result.success) {
        setArchiveOpen(false);
        router.push("/assets");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {asset.name}
            </h1>
            <AssetTypeBadge type={asset.type} />
            <AssetMonitoringBadge status={asset.monitoringStatus} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Client:{" "}
            <Link
              href={`/clients/${asset.clientId}`}
              className="text-accent hover:underline"
            >
              {asset.clientName}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RunSecurityCheckButton
            assetId={asset.id}
            canRun={canRunCheck}
            blockedReason={blockedReason}
          />
          <RunZapBaselineButton
            assetId={asset.id}
            canRun={canRunCheck}
            blockedReason={blockedReason}
          />
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit Asset
            </Button>
          )}
          {canArchive && asset.monitoringStatus !== "INACTIVE" && (
            <Button variant="danger" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          )}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Asset Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem
                  label="URL / Hostname"
                  value={asset.location}
                  isLink={Boolean(asset.url)}
                />
                <InfoItem label="Client" value={asset.clientName} />
                <div>
                  <dt className="text-xs font-medium text-muted">Type</dt>
                  <dd className="mt-1">
                    <AssetTypeBadge type={asset.type} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Environment</dt>
                  <dd className="mt-1">
                    <AssetEnvironmentBadge environment={asset.environment} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Criticality</dt>
                  <dd className="mt-1">
                    <AssetCriticalityBadge criticality={asset.criticality} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">
                    Authorization
                  </dt>
                  <dd className="mt-1">
                    <AssetAuthorizationBadge
                      status={asset.authorizationStatus}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Monitoring</dt>
                  <dd className="mt-1">
                    <AssetMonitoringBadge status={asset.monitoringStatus} />
                  </dd>
                </div>
                <InfoItem
                  label="Last Security Check"
                  value={
                    asset.lastSecurityCheckAt
                      ? formatDate(asset.lastSecurityCheckAt)
                      : "Never"
                  }
                />
                <InfoItem label="Created" value={formatDate(asset.createdAt)} />
                <InfoItem
                  label="Last Updated"
                  value={formatDate(asset.updatedAt)}
                />
              </dl>
              {asset.description && (
                <div className="mt-6 border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted">Description</p>
                  <p className="mt-1 text-sm text-foreground">
                    {asset.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <PostureScoreBreakdownCard
              posture={findingsPosture}
              passiveScore={passiveCheckScore}
            />

            <Card>
              <CardHeader>
                <CardTitle>Passive Check Indicators</CardTitle>
                <CardDescription>
                  HTTPS / TLS / Headers / Cookies from the latest passive check
                </CardDescription>
              </CardHeader>
              <CardContent>
                {posture ? (
                  <SecurityPostureCard {...posture} />
                ) : (
                  <p className="text-sm text-muted">
                    Run a security check to populate posture indicators.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "security-checks" && (
        <div className="space-y-8">
          <div>
            <h2 className="mb-1 text-sm font-medium text-foreground">
              Passive Security Checks
            </h2>
            <p className="mb-4 text-xs text-muted">
              HTTPS, TLS, headers, and cookie configuration observations.
            </p>
            <SecurityChecksPanel checks={securityChecks} />
          </div>
          <div>
            <h2 className="mb-1 text-sm font-medium text-foreground">
              ZAP Baseline Scans
            </h2>
            <p className="mb-4 text-xs text-muted">
              OWASP ZAP spider + passive alerts only. Active Scan is not used.
            </p>
            <ZapScansPanel scans={zapScans} />
          </div>
        </div>
      )}

      {activeTab === "findings" && (
        <FindingsList findings={findings} />
      )}

      {activeTab === "incidents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
            </p>
            <Link
              href={`/incidents?assetId=${asset.id}`}
              className="text-sm text-accent hover:underline"
            >
              View in Incidents
            </Link>
          </div>
          {incidents.length === 0 ? (
            <EmptyState
              title="No incidents"
              description="No security incidents are linked to this asset."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Assigned To</th>
                    <th className="px-4 py-3 font-medium">Detected</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {incidents.map((incident) => (
                    <tr key={incident.id} className="hover:bg-surface/40">
                      <td className="px-4 py-3">
                        <IncidentSeverityBadge severity={incident.severity} />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {incident.title}
                      </td>
                      <td className="px-4 py-3">
                        <IncidentStatusBadge status={incident.status} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {incident.assignedToName ?? "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(incident.detectedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="text-accent hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "security-events" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {securityEvents.length} mapped event
              {securityEvents.length !== 1 ? "s" : ""}
            </p>
            <Link
              href={`/security-events?assetId=${asset.id}`}
              className="text-sm text-accent hover:underline"
            >
              View in Security Events
            </Link>
          </div>
          {securityEvents.length === 0 ? (
            <EmptyState
              title="No security events"
              description="Mapped Wazuh security events for this asset will appear here."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Rule</th>
                    <th className="px-4 py-3 font-medium">Occurrences</th>
                    <th className="px-4 py-3 font-medium">Last Seen</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {securityEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-surface/40">
                      <td className="px-4 py-3">
                        <SecurityEventSeverityBadge
                          severity={event.severity}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{event.title}</td>
                      <td className="px-4 py-3">
                        <SecurityEventStatusBadge
                          status={
                            event.status as import("@prisma/client").SecurityEventStatus
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {event.ruleId ?? "—"}
                      </td>
                      <td className="px-4 py-3">{event.occurrenceCount}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(event.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/security-events/${event.id}`}
                          className="text-accent hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <EmptyState
          title="Activity — Coming Soon"
          description="Asset activity timeline will be available in a future release."
        />
      )}

      {editOpen && (
        <AssetFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          clients={clients}
          asset={asset}
          onSuccess={() => router.refresh()}
        />
      )}

      {archiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Archive Asset</CardTitle>
              <CardDescription>
                This will set {asset.name} to inactive monitoring status.
                Findings, scans, and incidents will be preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setArchiveOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleArchive}
                  disabled={isPending}
                >
                  {isPending ? "Archiving..." : "Confirm Archive"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function FindingsList({ findings }: { findings: AssetFindingItem[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="No findings for this asset"
        description="Passive configuration findings from security checks will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Finding</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Source
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Instances
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              First Detected
            </th>
            <th className="px-4 py-3 font-medium text-muted">Last Detected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((finding) => (
            <tr key={finding.id} className="bg-surface">
              <td className="px-4 py-3">
                <Link
                  href={`/vulnerabilities/${finding.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {finding.title}
                </Link>
                {finding.code && (
                  <p className="text-xs text-muted">{finding.code}</p>
                )}
              </td>
              <td className="px-4 py-3">{finding.severity}</td>
              <td className="px-4 py-3">{finding.status}</td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">
                {finding.source ?? "—"}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted md:table-cell">
                {finding.instanceCount && finding.instanceCount > 0
                  ? finding.instanceCount
                  : "—"}
              </td>
              <td className="hidden px-4 py-3 text-muted md:table-cell">
                {formatDate(
                  finding.firstDetectedAt ?? finding.createdAt ?? new Date()
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatDate(
                  finding.lastDetectedAt ??
                    finding.firstDetectedAt ??
                    finding.createdAt ??
                    new Date()
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getBlockedReason(asset: AssetDetail): string {
  if (asset.type !== "WEBSITE" && asset.type !== "WEB_APPLICATION") {
    return "Passive checks only support WEBSITE and WEB_APPLICATION assets.";
  }
  if (asset.authorizationStatus !== "AUTHORIZED") {
    return "Asset must be AUTHORIZED before running a security check.";
  }
  if (asset.monitoringStatus !== "ACTIVE") {
    return "Asset monitoring status must be ACTIVE.";
  }
  if (!asset.url) {
    return "Asset needs a stored URL before a security check can run.";
  }
  return "Unable to run security check.";
}

function InfoItem({
  label,
  value,
  isLink,
}: {
  label: string;
  value: string | null;
  isLink?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {value ? (
          isLink ? (
            <a
              href={value.startsWith("http") ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {value.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}
