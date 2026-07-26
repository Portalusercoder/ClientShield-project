import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SecurityScoreIndicator } from "@/components/clients/client-status-badge";
import { formatDate } from "@/lib/utils";
import type { ClientDetail } from "@/types/client";
import type {
  ClientReadinessResult,
  WazuhReadinessResult,
} from "@/types/client-onboarding";
import type { ClientPostureScoreResult } from "@/types/scoring";
import { SCORE_DISCLAIMER, SCORE_LABEL } from "@/types/scoring";
import { InfoItem, SummaryItem } from "./shared";

interface OverviewTabProps {
  client: ClientDetail;
  clientPosture: ClientPostureScoreResult;
  wazuhReadiness: WazuhReadinessResult | null;
  readiness: ClientReadinessResult | null;
  securityEventsCount: number;
}

export function OverviewTab({
  client,
  clientPosture,
  wazuhReadiness,
  readiness,
  securityEventsCount,
}: OverviewTabProps) {
  return (
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
              <SummaryItem label="Security events" value={securityEventsCount} />
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
  );
}
