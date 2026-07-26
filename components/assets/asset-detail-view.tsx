"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveAssetAction } from "@/app/(dashboard)/assets/actions";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActivityTab } from "@/components/assets/detail/activity-tab";
import { EnrollmentTab } from "@/components/assets/detail/enrollment-tab";
import { FindingsTab } from "@/components/assets/detail/findings-tab";
import { AssetDetailHeader } from "@/components/assets/detail/header";
import { IncidentsTab } from "@/components/assets/detail/incidents-tab";
import { OverviewTab } from "@/components/assets/detail/overview-tab";
import { AssetRelatedQuickActions } from "@/components/assets/detail/related-quick-actions";
import { SecurityChecksTab } from "@/components/assets/detail/security-checks-tab";
import { SecurityEventsTab } from "@/components/assets/detail/security-events-tab";
import { getBlockedReason } from "@/components/assets/detail/shared";
import { ENDPOINT_TYPES } from "@/components/assets/detail/types";
import type {
  AssetDetailViewProps,
  Tab,
} from "@/components/assets/detail/types";

export type {
  AssetDetailViewProps,
  AssetFindingItem,
} from "@/components/assets/detail/types";

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
  enrollments = [],
  endpointReadiness = null,
  canManageEnrollment = false,
}: AssetDetailViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEndpoint = ENDPOINT_TYPES.has(asset.type);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "security-checks", label: "Security Checks" },
    { id: "findings", label: "Findings" },
    { id: "incidents", label: "Incidents" },
    { id: "security-events", label: "Security Events" },
    ...(isEndpoint
      ? [{ id: "enrollment" as const, label: "Enrollment" }]
      : []),
    { id: "activity", label: "Activity" },
  ];

  const blockedReason = !canRunCheck ? getBlockedReason(asset) : null;

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveAssetAction(asset.id, "ARCHIVE");
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
      <AssetDetailHeader
        asset={asset}
        canRunCheck={canRunCheck}
        blockedReason={blockedReason}
        isEndpoint={isEndpoint}
        canEdit={canEdit}
        canArchive={canArchive}
        onEdit={() => setEditOpen(true)}
        onArchive={() => setArchiveOpen(true)}
      />

      <AssetRelatedQuickActions
        asset={asset}
        isEndpoint={isEndpoint}
        findings={findings}
        incidents={incidents}
        securityEvents={securityEvents}
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
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
        <OverviewTab
          asset={asset}
          isEndpoint={isEndpoint}
          endpointReadiness={endpointReadiness}
          findingsPosture={findingsPosture}
          passiveCheckScore={passiveCheckScore}
          posture={posture}
        />
      )}

      {activeTab === "enrollment" && isEndpoint && (
        <EnrollmentTab
          asset={asset}
          canManageEnrollment={canManageEnrollment}
          endpointReadiness={endpointReadiness}
          enrollments={enrollments}
        />
      )}

      {activeTab === "security-checks" && (
        <SecurityChecksTab securityChecks={securityChecks} zapScans={zapScans} />
      )}

      {activeTab === "findings" && <FindingsTab findings={findings} />}

      {activeTab === "incidents" && (
        <IncidentsTab assetId={asset.id} incidents={incidents} />
      )}

      {activeTab === "security-events" && (
        <SecurityEventsTab assetId={asset.id} securityEvents={securityEvents} />
      )}

      {activeTab === "activity" && <ActivityTab />}

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
