import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientOnboardingWorkspace } from "@/components/clients/client-onboarding-workspace";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listAssetsForClient } from "@/services/assets.service";
import { getClientById } from "@/services/clients.service";
import { listClientContacts } from "@/services/clients/client-contacts.service";
import { getOrCreateClientOnboarding } from "@/services/clients/client-onboarding.service";
import {
  calculateClientReadiness,
  calculateWazuhReadiness,
} from "@/services/clients/client-readiness.service";
import { listClientServices } from "@/services/clients/client-services.service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const client = await getClientById(session.organizationId, id);
  return {
    title: client ? `Onboarding · ${client.name}` : "Client Onboarding",
  };
}

export default async function ClientOnboardingPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const client = await getClientById(session.organizationId, id);
  if (!client) notFound();

  const [assets, contacts, services, onboarding, readiness, wazuhReadiness] =
    await Promise.all([
      listAssetsForClient(session.organizationId, client.id),
      listClientContacts(session.organizationId, client.id),
      listClientServices(session.organizationId, client.id),
      getOrCreateClientOnboarding(session.organizationId, client.id),
      calculateClientReadiness(session.organizationId, client.id),
      calculateWazuhReadiness(session.organizationId, client.id),
    ]);

  if (!onboarding) notFound();

  return (
    <ClientOnboardingWorkspace
      client={client}
      assets={assets}
      contacts={contacts}
      services={services}
      onboarding={onboarding}
      readiness={readiness}
      wazuhReadiness={wazuhReadiness}
      canManage={hasMinimumRole(session, "ADMIN")}
      canCreateAsset={hasMinimumRole(session, "ANALYST")}
    />
  );
}
