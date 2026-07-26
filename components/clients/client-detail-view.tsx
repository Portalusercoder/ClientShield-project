"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveClientAction } from "@/app/(dashboard)/clients/actions";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import { ClientFormModal } from "@/components/clients/client-form-modal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActivityTab } from "@/components/clients/detail/activity-tab";
import { AssetsTab } from "@/components/clients/detail/assets-tab";
import { ContactsTab } from "@/components/clients/detail/contacts-tab";
import { ClientDetailHeader } from "@/components/clients/detail/header";
import {
  FindingsTab,
  IncidentsTab,
  InvestigationsTab,
  ReportsTab,
  SecurityEventsTab,
} from "@/components/clients/detail/linked-tables";
import { OnboardingTab } from "@/components/clients/detail/onboarding-tab";
import { OverviewTab } from "@/components/clients/detail/overview-tab";
import { ScopeTab } from "@/components/clients/detail/scope-tab";
import { ServicesTab } from "@/components/clients/detail/services-tab";
import { TABS } from "@/components/clients/detail/types";
import type { ClientDetailViewProps } from "@/components/clients/detail/types";

export type { ClientDetailViewProps } from "@/components/clients/detail/types";

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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(
    "overview"
  );
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClientAction(client.id, "OFFBOARD");
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
      <ClientDetailHeader
        client={client}
        canEdit={canEdit}
        canArchive={canArchive}
        onEdit={() => setEditOpen(true)}
        onArchive={() => setArchiveOpen(true)}
      />

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
        <OverviewTab
          client={client}
          clientPosture={clientPosture}
          wazuhReadiness={wazuhReadiness}
          readiness={readiness}
          securityEventsCount={securityEvents.length}
        />
      )}

      {activeTab === "onboarding" && (
        <OnboardingTab client={client} onboarding={onboarding} readiness={readiness} />
      )}

      {activeTab === "scope" && (
        <ScopeTab assets={assets} services={services} />
      )}

      {activeTab === "assets" && (
        <AssetsTab
          clientId={client.id}
          assets={assets}
          canManageClient={canManageClient}
          canCreateAsset={canCreateAsset}
          isPending={isPending}
          onAddAsset={() => setAddAssetOpen(true)}
          runAction={runAction}
        />
      )}

      {activeTab === "services" && (
        <ServicesTab
          clientId={client.id}
          services={services}
          canManageClient={canManageClient}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {activeTab === "contacts" && (
        <ContactsTab
          clientId={client.id}
          contacts={contacts}
          canManageClient={canManageClient}
          isPending={isPending}
          runAction={runAction}
        />
      )}

      {activeTab === "findings" && <FindingsTab findings={findings} />}

      {activeTab === "security-events" && (
        <SecurityEventsTab securityEvents={securityEvents} />
      )}

      {activeTab === "investigations" && (
        <InvestigationsTab investigations={investigations} />
      )}

      {activeTab === "incidents" && <IncidentsTab incidents={incidents} />}

      {activeTab === "reports" && <ReportsTab reports={reports} />}

      {activeTab === "activity" && <ActivityTab activity={activity} />}

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
