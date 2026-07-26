import { useMemo } from "react";
import { RelatedObjectsPanel } from "@/components/workflow/related-objects-panel";
import { WorkflowQuickActions } from "@/components/workflow/workflow-quick-actions";
import type { AssetDetail } from "@/types/asset";
import type {
  AssetFindingItem,
  AssetIncidentItem,
  AssetSecurityEventItem,
} from "./types";

interface AssetRelatedQuickActionsProps {
  asset: AssetDetail;
  isEndpoint: boolean;
  findings: AssetFindingItem[];
  incidents: AssetIncidentItem[];
  securityEvents: AssetSecurityEventItem[];
}

export function AssetRelatedQuickActions({
  asset,
  isEndpoint,
  findings,
  incidents,
  securityEvents,
}: AssetRelatedQuickActionsProps) {
  const relatedObjects = useMemo(() => {
    const items: {
      id: string;
      kind: "finding" | "incident" | "security-event" | "endpoint";
      label: string;
      href: string;
      meta?: string;
    }[] = [];
    for (const f of findings.slice(0, 3)) {
      items.push({
        id: f.id,
        kind: "finding",
        label: f.title,
        href: `/vulnerabilities/${f.id}`,
        meta: f.severity,
      });
    }
    for (const i of incidents.slice(0, 3)) {
      items.push({
        id: i.id,
        kind: "incident",
        label: i.title,
        href: `/incidents/${i.id}`,
        meta: i.status,
      });
    }
    for (const e of securityEvents.slice(0, 3)) {
      items.push({
        id: e.id,
        kind: "security-event",
        label: e.title,
        href: `/security-events/${e.id}`,
        meta: e.status,
      });
    }
    if (isEndpoint) {
      items.push({
        id: `${asset.id}-enrollment`,
        kind: "endpoint",
        label: "Endpoint enrollment",
        href: `/assets/${asset.id}/enrollment`,
        meta: "Endpoint",
      });
    }
    return items;
  }, [findings, incidents, securityEvents, isEndpoint, asset.id]);

  const quickActions = useMemo(() => {
    const actions: {
      id: string;
      label: string;
      href: string;
      available: boolean;
    }[] = [
      {
        id: "client",
        label: "Open Client",
        href: `/clients/${asset.clientId}`,
        available: Boolean(asset.clientId),
      },
    ];
    if (isEndpoint) {
      actions.push({
        id: "enrollment",
        label: "Open Enrollment",
        href: `/assets/${asset.id}/enrollment`,
        available: true,
      });
    }
    if (findings[0]) {
      actions.push({
        id: "finding",
        label: "Open Finding",
        href: `/vulnerabilities/${findings[0].id}`,
        available: true,
      });
    }
    return actions;
  }, [asset.clientId, asset.id, isEndpoint, findings]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RelatedObjectsPanel
        title="Related objects"
        objects={relatedObjects}
        emptyTitle="No related findings or events"
        emptyDescription="Security Events, Findings, and Incidents for this asset will appear here once detected."
      />
      <WorkflowQuickActions actions={quickActions} />
    </div>
  );
}
