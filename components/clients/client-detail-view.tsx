"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveClientAction } from "@/app/(dashboard)/clients/actions";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import {
  AssetAuthorizationBadge,
  AssetCriticalityBadge,
  AssetMonitoringBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import { ClientFormModal } from "@/components/clients/client-form-modal";
import {
  ClientStatusBadge,
  SecurityScoreIndicator,
} from "@/components/clients/client-status-badge";
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
import type { AssetListItem } from "@/types/asset";
import type { ClientDetail } from "@/types/client";
import type { FindingListItem } from "@/types/findings";
import type { ClientPostureScoreResult } from "@/types/scoring";
import { SCORE_DISCLAIMER, SCORE_LABEL } from "@/types/scoring";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import {
  SecurityEventSeverityBadge,
  SecurityEventStatusBadge,
} from "@/components/security-events/security-event-badges";

interface ClientIncidentItem {
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
  assetId: string | null;
  assetName: string | null;
  assignedToName: string | null;
}

interface ClientSecurityEventItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  status: string;
  asset: { name: string } | null;
  agentName: string | null;
  occurrenceCount: number;
  lastSeenAt: Date;
}

interface ClientDetailViewProps {
  client: ClientDetail;
  assets: AssetListItem[];
  findings: FindingListItem[];
  incidents: ClientIncidentItem[];
  securityEvents: ClientSecurityEventItem[];
  clientPosture: ClientPostureScoreResult;
  canEdit: boolean;
  canArchive: boolean;
  canCreateAsset: boolean;
}

type Tab =
  | "overview"
  | "assets"
  | "vulnerabilities"
  | "incidents"
  | "security-events"
  | "reports";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets" },
  { id: "vulnerabilities", label: "Vulnerabilities" },
  { id: "incidents", label: "Incidents" },
  { id: "security-events", label: "Security Events" },
  { id: "reports", label: "Reports" },
];

export function ClientDetailView({
  client,
  assets,
  findings,
  incidents,
  securityEvents,
  clientPosture,
  canEdit,
  canArchive,
  canCreateAsset,
}: ClientDetailViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClientAction(client.id);
      if (result.success) {
        setArchiveOpen(false);
        router.push("/clients");
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {client.name}
            </h1>
            <ClientStatusBadge status={client.status} />
          </div>
          {client.industry && (
            <p className="mt-1 text-sm text-muted">{client.industry}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit Client
            </Button>
          )}
          {canArchive && client.status !== "INACTIVE" && (
            <Button variant="danger" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
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
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem
                  label="Primary Contact"
                  value={client.primaryContactName}
                />
                <InfoItem
                  label="Contact Email"
                  value={client.primaryContactEmail}
                />
                <InfoItem label="Phone" value={client.phone} />
                <InfoItem
                  label="Website"
                  value={client.website}
                  isLink={Boolean(client.website)}
                />
                <InfoItem
                  label="Date Added"
                  value={formatDate(client.createdAt)}
                />
                <InfoItem
                  label="Last Updated"
                  value={formatDate(client.updatedAt)}
                />
              </dl>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{SCORE_LABEL}</CardTitle>
                <CardDescription>
                  {clientPosture.assessedAssets > 0
                    ? `Coverage: ${clientPosture.coveragePercent ?? 0}% (${clientPosture.assessedAssets}/${clientPosture.totalAssets} assets)`
                    : "Not Assessed"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <SecurityScoreIndicator
                    score={clientPosture.displayScore}
                    className="text-4xl"
                  />
                  <p className="mt-1 text-xs text-muted">out of 100</p>
                  <p className="mt-2 text-xs text-muted">{SCORE_DISCLAIMER}</p>
                </div>
                <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                  <SummaryItem
                    label="Critical Assets"
                    value={clientPosture.criticalAssets}
                  />
                  <SummaryItem
                    label="Open Findings"
                    value={clientPosture.openFindings}
                  />
                  <SummaryItem
                    label="Validated Findings"
                    value={clientPosture.validatedFindings}
                  />
                  <SummaryItem
                    label="Accepted Risks"
                    value={clientPosture.acceptedRisks}
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <SummaryItem label="Assets" value={client.assetsCount} />
                  <SummaryItem
                    label="Open Vulnerabilities"
                    value={client.openFindingsCount}
                  />
                  <SummaryItem
                    label="Open Incidents"
                    value={client.openIncidentsCount}
                  />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "assets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {assets.length} asset{assets.length !== 1 ? "s" : ""} for this
              client
            </p>
            {canCreateAsset && (
              <Button onClick={() => setAddAssetOpen(true)}>Add Asset</Button>
            )}
          </div>

          {assets.length === 0 ? (
            <EmptyState
              title="No assets registered"
              description="Register websites, APIs, servers, or other digital assets to begin monitoring this client's security posture."
            >
              {canCreateAsset && (
                <Button className="mt-4" onClick={() => setAddAssetOpen(true)}>
                  Add Asset
                </Button>
              )}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 font-medium text-muted">Name</th>
                    <th className="px-4 py-3 font-medium text-muted">Type</th>
                    <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
                      Location
                    </th>
                    <th className="px-4 py-3 font-medium text-muted">
                      Criticality
                    </th>
                    <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
                      Monitoring
                    </th>
                    <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
                      Authorization
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assets.map((asset) => (
                    <tr key={asset.id} className="bg-surface">
                      <td className="px-4 py-3">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {asset.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <AssetTypeBadge type={asset.type} />
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">
                        {asset.location.replace(/^https?:\/\//, "")}
                      </td>
                      <td className="px-4 py-3">
                        <AssetCriticalityBadge
                          criticality={asset.criticality}
                        />
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <AssetMonitoringBadge
                          status={asset.monitoringStatus}
                        />
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <AssetAuthorizationBadge
                          status={asset.authorizationStatus}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "vulnerabilities" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across
            this client&apos;s assets
          </p>
          {findings.length === 0 ? (
            <EmptyState
              title="No findings for this client"
              description="Security findings from monitored assets belonging to this client will appear here."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 font-medium text-muted">
                      Finding
                    </th>
                    <th className="px-4 py-3 font-medium text-muted">Asset</th>
                    <th className="px-4 py-3 font-medium text-muted">
                      Severity
                    </th>
                    <th className="px-4 py-3 font-medium text-muted">Status</th>
                    <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
                      Source
                    </th>
                    <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
                      Instances
                    </th>
                    <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
                      Last Detected
                    </th>
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
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/assets/${finding.assetId}`}
                          className="text-muted hover:text-accent"
                        >
                          {finding.assetName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{finding.severity}</td>
                      <td className="px-4 py-3">{finding.status}</td>
                      <td className="hidden px-4 py-3 text-muted sm:table-cell">
                        {finding.source}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums text-muted md:table-cell">
                        {finding.instanceCount > 0
                          ? finding.instanceCount
                          : "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">
                        {formatDate(finding.lastDetectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "incidents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
            </p>
            <Link
              href={`/incidents?clientId=${client.id}`}
              className="text-sm text-accent hover:underline"
            >
              View in Incidents
            </Link>
          </div>
          {incidents.length === 0 ? (
            <EmptyState
              title="No incidents"
              description="No security incidents have been recorded for this client."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
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
                        {incident.assetName ?? "—"}
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
              href={`/security-events?clientId=${client.id}`}
              className="text-sm text-accent hover:underline"
            >
              View in Security Events
            </Link>
          </div>
          {securityEvents.length === 0 ? (
            <EmptyState
              title="No security events"
              description="Mapped Wazuh security events for this client will appear here."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
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
                        {event.asset?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">{event.occurrenceCount}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(event.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/security-events/${event.id}`}
                          className="text-sm text-accent hover:underline"
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

      {activeTab === "reports" && (
        <EmptyState
          title="Reports — Coming Soon"
          description="Client-scoped report browsing will be available in a future release. Use the Reports module for security posture reports."
        />
      )}

      {editOpen && (
        <ClientFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          client={client}
          onSuccess={() => router.refresh()}
        />
      )}

      {addAssetOpen && (
        <AssetFormModal
          open={addAssetOpen}
          onClose={() => setAddAssetOpen(false)}
          clients={[{ id: client.id, name: client.name }]}
          defaultClientId={client.id}
          onSuccess={(id) => {
            router.push(`/assets/${id}`);
            router.refresh();
          }}
        />
      )}

      {archiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Archive Client</CardTitle>
              <CardDescription>
                This will set {client.name} to inactive status. Security data
                will be preserved. This action is audited.
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
              href={value}
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

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
