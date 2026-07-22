import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientDetailView } from "@/components/clients/client-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listAssetsForClient } from "@/services/assets.service";
import { getClientById } from "@/services/clients.service";
import { listClientActivity } from "@/services/clients/client-activity.service";
import { listClientContacts } from "@/services/clients/client-contacts.service";
import { getOrCreateClientOnboarding } from "@/services/clients/client-onboarding.service";
import {
  calculateClientReadiness,
  calculateWazuhReadiness,
} from "@/services/clients/client-readiness.service";
import { listClientServices } from "@/services/clients/client-services.service";
import { listFindingsForClient } from "@/services/findings.service";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ClientDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const client = await getClientById(session.organizationId, id);

  return {
    title: client ? client.name : "Client Not Found",
  };
}

export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const client = await getClientById(session.organizationId, id);
  if (!client) notFound();

  const [
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
    activityResult,
    clientPosture,
  ] = await Promise.all([
    listAssetsForClient(session.organizationId, client.id),
    listFindingsForClient(session.organizationId, client.id),
    (await import("@/services/incidents.service")).listIncidentsForClient(
      session.organizationId,
      client.id
    ),
    (
      await import("@/services/security-events.service")
    ).listSecurityEventsForClient(session.organizationId, client.id),
    prisma.investigationGroup.findMany({
      where: { organizationId: session.organizationId, clientId: client.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        createdByType: true,
        confidence: true,
        updatedAt: true,
        _count: { select: { events: true } },
      },
    }),
    prisma.report.findMany({
      where: { organizationId: session.organizationId, clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, createdAt: true },
    }),
    listClientContacts(session.organizationId, client.id),
    listClientServices(session.organizationId, client.id),
    getOrCreateClientOnboarding(session.organizationId, client.id),
    calculateClientReadiness(session.organizationId, client.id),
    calculateWazuhReadiness(session.organizationId, client.id),
    listClientActivity(session.organizationId, client.id, {
      page: 1,
      pageSize: 30,
    }),
    (await import("@/services/scoring/client-security-score.service"))
      .calculateClientSecurityPosture(session.organizationId, client.id),
  ]);

  return (
    <ClientDetailView
      client={client}
      assets={assets}
      findings={findings}
      incidents={incidents}
      securityEvents={securityEvents}
      investigations={investigations.map((inv) => ({
        id: inv.id,
        title: inv.title,
        status: inv.status,
        createdByType: inv.createdByType,
        confidence: inv.confidence,
        eventCount: inv._count.events,
        updatedAt: inv.updatedAt,
      }))}
      reports={reports}
      contacts={contacts}
      services={services}
      onboarding={onboarding}
      readiness={readiness}
      wazuhReadiness={wazuhReadiness}
      activity={activityResult.items}
      clientPosture={clientPosture}
      canEdit={hasMinimumRole(session, "ADMIN")}
      canManageClient={hasMinimumRole(session, "ADMIN")}
      canArchive={hasMinimumRole(session, "ADMIN")}
      canCreateAsset={hasMinimumRole(session, "ANALYST")}
    />
  );
}
