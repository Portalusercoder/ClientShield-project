"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveClientAction,
  createClientContactAction,
  deleteClientContactAction,
  disableClientServiceAction,
  enableClientServiceAction,
  pauseClientServiceAction,
  updateAssetAuthorizationAction,
} from "@/app/(dashboard)/clients/actions";
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
  OnboardingStatusBadge,
  ReadinessBadge,
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import type { AssetListItem } from "@/types/asset";
import type { ClientDetail } from "@/types/client";
import type {
  ClientActivityItem,
  ClientContactRecord,
  ClientOnboardingRecord,
  ClientReadinessResult,
  ClientServiceRecord,
  WazuhReadinessResult,
} from "@/types/client-onboarding";
import { SERVICE_CATALOG } from "@/types/client-onboarding";
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
  status: string;
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

interface ClientInvestigationItem {
  id: string;
  title: string;
  status: string;
  createdByType: string;
  confidence: string | null;
  eventCount: number;
  updatedAt: Date;
}

interface ClientReportItem {
  id: string;
  title: string;
  createdAt: Date;
}

const SERVICE_LABELS: Record<(typeof SERVICE_CATALOG)[number], string> = {
  PASSIVE_WEB_MONITORING: "Passive Web Monitoring",
  ZAP_BASELINE: "ZAP Baseline",
  WAZUH_ENDPOINT_MONITORING: "Wazuh Endpoint Monitoring",
  SECURITY_EVENT_MONITORING: "Security Event Monitoring",
  INCIDENT_RESPONSE: "Incident Response",
  REPORTING: "Reporting",
};

type Tab =
  | "overview"
  | "onboarding"
  | "scope"
  | "assets"
  | "services"
  | "contacts"
  | "findings"
  | "security-events"
  | "investigations"
  | "incidents"
  | "reports"
  | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "onboarding", label: "Onboarding" },
  { id: "scope", label: "Security Scope" },
  { id: "assets", label: "Assets" },
  { id: "services", label: "Services" },
  { id: "contacts", label: "Contacts" },
  { id: "findings", label: "Findings" },
  { id: "security-events", label: "Security Events" },
  { id: "investigations", label: "Investigations" },
  { id: "incidents", label: "Incidents" },
  { id: "reports", label: "Reports" },
  { id: "activity", label: "Activity" },
];

interface ClientDetailViewProps {
  client: ClientDetail;
  assets: AssetListItem[];
  findings: FindingListItem[];
  incidents: ClientIncidentItem[];
  securityEvents: ClientSecurityEventItem[];
  investigations: ClientInvestigationItem[];
  reports: ClientReportItem[];
  contacts: ClientContactRecord[];
  services: ClientServiceRecord[];
  onboarding: ClientOnboardingRecord | null;
  readiness: ClientReadinessResult | null;
  wazuhReadiness: WazuhReadinessResult | null;
  activity: ClientActivityItem[];
  clientPosture: ClientPostureScoreResult;
  canEdit: boolean;
  canManageClient: boolean;
  canArchive: boolean;
  canCreateAsset: boolean;
}

function InfoItem({
  label,
  value,
  isLink,
}: {
  label: string;
  value: string | null | undefined;
  isLink?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {value ? (
          isLink ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {value}
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

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function ClientDetailView({
  client,
  assets,
  findings,
  incidents,
  securityEvents,
  investigations,
  reports,
  contacts,
  services,
  onboarding,
  readiness,
  wazuhReadiness,
  activity,
  clientPosture,
  canEdit,
  canManageClient,
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

  const websiteAssets = assets.filter(
    (a) => a.type === "WEBSITE" || a.type === "WEB_APPLICATION"
  );
  const endpointAssets = assets.filter(
    (a) => a.type === "WORKSTATION" || a.type === "SERVER"
  );
  const networkAssets = assets.filter((a) => a.type === "NETWORK_DEVICE");

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClientAction(client.id);
      if (result.success) {
        setArchiveOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function runAction(
    fn: () => Promise<{ success: boolean; error?: string }>
  ) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) router.refresh();
      else setError(result.error ?? "Action failed");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {client.name}
            </h1>
            <ClientStatusBadge status={client.status} />
            <OnboardingStatusBadge status={client.onboardingStatus} />
            <ReadinessBadge overall={client.readinessSummary?.overall} />
          </div>
          {client.industry && (
            <p className="mt-1 text-sm text-muted">{client.industry}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/clients/${client.id}/onboarding`}>
            <Button variant="secondary">Onboarding</Button>
          </Link>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit Client
            </Button>
          )}
          {canArchive &&
            client.status !== "OFFBOARDED" &&
            client.status !== "INACTIVE" && (
              <Button variant="danger" onClick={() => setArchiveOpen(true)}>
                Offboard
              </Button>
            )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
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
              <CardTitle>Client profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem label="Primary contact" value={client.primaryContactName} />
                <InfoItem label="Contact email" value={client.primaryContactEmail} />
                <InfoItem label="Phone" value={client.phone} />
                <InfoItem label="Website" value={client.website} isLink={Boolean(client.website)} />
                <InfoItem label="Country" value={client.country} />
                <InfoItem label="Timezone" value={client.timezone} />
                <InfoItem label="Created" value={formatDate(client.createdAt)} />
                <InfoItem label="Updated" value={formatDate(client.updatedAt)} />
              </dl>
              {client.notes && (
                <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
                  {client.notes}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{SCORE_LABEL}</CardTitle>
                <CardDescription>
                  {clientPosture.assessedAssets > 0
                    ? `Coverage: ${clientPosture.coveragePercent ?? 0}%`
                    : "Not assessed"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <SecurityScoreIndicator
                    score={clientPosture.displayScore}
                    className="text-4xl"
                  />
                  <p className="mt-2 text-xs text-muted">{SCORE_DISCLAIMER}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workspace summary</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <SummaryItem label="Assets" value={client.assetsCount} />
                  <SummaryItem label="Services" value={client.servicesCount} />
                  <SummaryItem label="Open findings" value={client.openFindingsCount} />
                  <SummaryItem label="Security events" value={securityEvents.length} />
                  <SummaryItem label="Investigations" value={client.openInvestigationsCount} />
                  <SummaryItem label="Open incidents" value={client.openIncidentsCount} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Wazuh readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  {wazuhReadiness?.status ?? "NOT_APPLICABLE"}
                </p>
                <p className="text-muted">
                  {wazuhReadiness?.message ??
                    "Wazuh endpoint monitoring is not selected for this client."}
                </p>
                {wazuhReadiness && (
                  <dl className="space-y-1 border-t border-border pt-2">
                    <SummaryItem
                      label="Endpoint assets"
                      value={wazuhReadiness.endpointAssetCount}
                    />
                    <SummaryItem
                      label="Mapped agents"
                      value={wazuhReadiness.mappedAgentCount}
                    />
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>

          {readiness && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Configuration readiness</CardTitle>
                <CardDescription>
                  Calculated from live configuration — not a manual percentage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {readiness.checks.map((check) => (
                    <li
                      key={check.key}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span
                        className={
                          check.passed ? "text-success" : "text-warning"
                        }
                      >
                        {check.passed ? "Ready" : "Open"}
                      </span>
                      <span className="ml-2 text-foreground">{check.label}</span>
                      <p className="mt-1 text-xs text-muted">{check.message}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "onboarding" && (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding status</CardTitle>
            <CardDescription>
              Guided setup lives on the onboarding workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-1">
                  <OnboardingStatusBadge status={onboarding?.status ?? null} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Current step</dt>
                <dd className="mt-1 text-foreground">
                  {onboarding?.currentStep ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Completed</dt>
                <dd className="mt-1 text-foreground">
                  {onboarding?.completedAt
                    ? formatDate(onboarding.completedAt)
                    : "—"}
                </dd>
              </div>
            </dl>
            {readiness?.blockers?.length ? (
              <div>
                <p className="text-sm font-medium text-foreground">Blockers</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                  {readiness.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Link href={`/clients/${client.id}/onboarding`}>
              <Button>Open onboarding workspace</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {activeTab === "scope" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Websites / apps", count: websiteAssets.length },
            { label: "Endpoints", count: endpointAssets.length },
            { label: "Network devices", count: networkAssets.length },
            { label: "Authorized assets", count: assets.filter((a) => a.authorizationStatus === "AUTHORIZED").length },
            { label: "Pending authorization", count: assets.filter((a) => a.authorizationStatus === "PENDING").length },
            { label: "Active services", count: services.filter((s) => s.status === "ACTIVE").length },
          ].map((item) => (
            <Card key={item.label}>
              <CardHeader>
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{item.count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "assets" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canCreateAsset && (
              <Button onClick={() => setAddAssetOpen(true)}>Add asset</Button>
            )}
          </div>
          {assets.length === 0 ? (
            <EmptyState
              title="No assets"
              description="Add websites, applications, or endpoints in scope for this client."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 font-medium text-muted">Asset</th>
                    <th className="px-4 py-3 font-medium text-muted">Type</th>
                    <th className="px-4 py-3 font-medium text-muted">Criticality</th>
                    <th className="px-4 py-3 font-medium text-muted">Monitoring</th>
                    <th className="px-4 py-3 font-medium text-muted">Authorization</th>
                    {canManageClient && (
                      <th className="px-4 py-3 font-medium text-muted">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assets.map((asset) => (
                    <tr key={asset.id}>
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
                      <td className="px-4 py-3">
                        <AssetCriticalityBadge criticality={asset.criticality} />
                      </td>
                      <td className="px-4 py-3">
                        <AssetMonitoringBadge status={asset.monitoringStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <AssetAuthorizationBadge
                          status={asset.authorizationStatus}
                        />
                      </td>
                      {canManageClient && (
                        <td className="px-4 py-3">
                          {asset.authorizationStatus !== "AUTHORIZED" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isPending}
                              onClick={() =>
                                runAction(() =>
                                  updateAssetAuthorizationAction(
                                    asset.id,
                                    client.id,
                                    "AUTHORIZED"
                                  )
                                )
                              }
                            >
                              Authorize
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "services" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Enabling a service does not mean setup is complete. Readiness is
            calculated separately.
          </p>
          {SERVICE_CATALOG.map((serviceType) => {
            const existing = services.find((s) => s.serviceType === serviceType);
            return (
              <Card key={serviceType}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {SERVICE_LABELS[serviceType]}
                    </p>
                    <p className="text-sm text-muted">
                      Status: {existing?.status ?? "Not configured"}
                    </p>
                  </div>
                  {canManageClient && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={isPending || existing?.status === "ACTIVE"}
                        onClick={() =>
                          runAction(() =>
                            enableClientServiceAction(client.id, serviceType)
                          )
                        }
                      >
                        Enable
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending || !existing || existing.status === "PAUSED"}
                        onClick={() =>
                          runAction(() =>
                            pauseClientServiceAction(client.id, serviceType)
                          )
                        }
                      >
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={isPending || !existing || existing.status === "DISABLED"}
                        onClick={() =>
                          runAction(() =>
                            disableClientServiceAction(client.id, serviceType)
                          )
                        }
                      >
                        Disable
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "contacts" && (
        <div className="space-y-4">
          {canManageClient && (
            <form
              className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                runAction(() => createClientContactAction(client.id, fd));
                e.currentTarget.reset();
              }}
            >
              <Input name="name" label="Name" required />
              <Input name="email" label="Email" type="email" required />
              <Input name="phone" label="Phone" />
              <Input name="jobTitle" label="Job title" />
              <Select
                name="contactType"
                label="Type"
                defaultValue="OTHER"
                options={[
                  { value: "PRIMARY", label: "Primary" },
                  { value: "TECHNICAL", label: "Technical" },
                  { value: "SECURITY", label: "Security" },
                  { value: "BILLING", label: "Billing" },
                  { value: "EXECUTIVE", label: "Executive" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
              <label className="flex items-center gap-2 self-end text-sm text-foreground">
                <input type="checkbox" name="isPrimary" value="true" />
                Primary contact
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  Add contact
                </Button>
              </div>
            </form>
          )}
          {contacts.length === 0 ? (
            <EmptyState
              title="No contacts"
              description="Client contacts do not receive ClientShield login access."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated">
                    <th className="px-4 py-3 font-medium text-muted">Name</th>
                    <th className="px-4 py-3 font-medium text-muted">Email</th>
                    <th className="px-4 py-3 font-medium text-muted">Type</th>
                    <th className="px-4 py-3 font-medium text-muted">Primary</th>
                    {canManageClient && (
                      <th className="px-4 py-3 font-medium text-muted">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">{c.name}</td>
                      <td className="px-4 py-3 text-muted">{c.email}</td>
                      <td className="px-4 py-3">{c.contactType}</td>
                      <td className="px-4 py-3">{c.isPrimary ? "Yes" : "—"}</td>
                      {canManageClient && (
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={isPending}
                            onClick={() =>
                              runAction(() =>
                                deleteClientContactAction(c.id, client.id)
                              )
                            }
                          >
                            Remove
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "findings" && (
        findings.length === 0 ? (
          <EmptyState title="No findings" description="No findings for this client yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 font-medium text-muted">Finding</th>
                  <th className="px-4 py-3 font-medium text-muted">Severity</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3">
                      <Link href={`/vulnerabilities/${f.id}`} className="hover:text-accent">
                        {f.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{f.severity}</td>
                    <td className="px-4 py-3">{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "security-events" && (
        securityEvents.length === 0 ? (
          <EmptyState title="No security events" description="No events linked to this client." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 font-medium text-muted">Event</th>
                  <th className="px-4 py-3 font-medium text-muted">Severity</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {securityEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <Link href={`/security-events/${e.id}`} className="hover:text-accent">
                        {e.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <SecurityEventSeverityBadge severity={e.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <SecurityEventStatusBadge status={e.status as never} />
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(e.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "investigations" && (
        investigations.length === 0 ? (
          <EmptyState title="No investigations" description="No investigation groups for this client." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 font-medium text-muted">Investigation</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted">Source</th>
                  <th className="px-4 py-3 font-medium text-muted">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investigations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3">
                      <Link href={`/investigations/${inv.id}`} className="hover:text-accent">
                        {inv.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{inv.status}</td>
                    <td className="px-4 py-3">{inv.createdByType}</td>
                    <td className="px-4 py-3 tabular-nums">{inv.eventCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "incidents" && (
        incidents.length === 0 ? (
          <EmptyState title="No incidents" description="No incidents for this client." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="px-4 py-3 font-medium text-muted">Incident</th>
                  <th className="px-4 py-3 font-medium text-muted">Severity</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted">Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td className="px-4 py-3">
                      <Link href={`/incidents/${inc.id}`} className="hover:text-accent">
                        {inc.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <IncidentSeverityBadge severity={inc.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <IncidentStatusBadge status={inc.status as never} />
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(inc.detectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "reports" && (
        reports.length === 0 ? (
          <EmptyState title="No reports" description="Reports for this client will appear here." />
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-md border border-border px-4 py-3 text-sm">
                <Link href={`/reports/${r.id}`} className="font-medium hover:text-accent">
                  {r.title}
                </Link>
                <p className="text-muted">{formatDate(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )
      )}

      {activeTab === "activity" && (
        activity.length === 0 ? (
          <EmptyState title="No activity yet" description="Client lifecycle and configuration changes will appear here." />
        ) : (
          <ul className="space-y-2">
            {activity.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border px-4 py-3 text-sm"
              >
                <p className="font-medium text-foreground">{item.action}</p>
                <p className="text-muted">
                  {item.resourceType}
                  {item.resourceId ? ` · ${item.resourceId}` : ""} ·{" "}
                  {formatDate(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )
      )}

      <ClientFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
      />
      <AssetFormModal
        open={addAssetOpen}
        onClose={() => setAddAssetOpen(false)}
        clients={[{ id: client.id, name: client.name }]}
        defaultClientId={client.id}
      />

      {archiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Offboard client?</CardTitle>
              <CardDescription>
                Marks the client OFFBOARDED. Historical security data is
                preserved. Agents and Wazuh data are not deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={isPending} onClick={handleArchive}>
                Confirm offboard
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
