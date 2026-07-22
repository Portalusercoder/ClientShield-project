import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientDetailView } from "@/components/clients/client-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { listAssetsForClient } from "@/services/assets.service";
import { getClientById } from "@/services/clients.service";
import { listFindingsForClient } from "@/services/findings.service";

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

  // organizationId from session — never from client input
  const client = await getClientById(session.organizationId, id);

  if (!client) {
    notFound();
  }

  const [assets, findings, incidents, securityEvents, clientPosture] =
    await Promise.all([
      listAssetsForClient(session.organizationId, client.id),
      listFindingsForClient(session.organizationId, client.id),
      (await import("@/services/incidents.service")).listIncidentsForClient(
        session.organizationId,
        client.id
      ),
      (
        await import("@/services/security-events.service")
      ).listSecurityEventsForClient(session.organizationId, client.id),
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
      clientPosture={clientPosture}
      canEdit={hasMinimumRole(session, "ANALYST")}
      canArchive={hasMinimumRole(session, "ADMIN")}
      canCreateAsset={hasMinimumRole(session, "ANALYST")}
    />
  );
}
