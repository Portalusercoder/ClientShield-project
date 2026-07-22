import type { Metadata } from "next";
import { WazuhIntegrationClient } from "@/components/integrations/wazuh-integration-client";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getWazuhIntegrationStatus,
} from "@/services/security-events.service";
import { listWazuhAgentsWithMappings } from "@/services/wazuh/wazuh-agent.service";

export const metadata: Metadata = {
  title: "Wazuh Integration",
};

export const dynamic = "force-dynamic";

export default async function WazuhIntegrationPage() {
  const session = await requireSession();
  const canSync = hasMinimumRole(session, "ANALYST");
  const canMapAgents = hasMinimumRole(session, "ADMIN");

  const [status, agents, clients, assets] = await Promise.all([
    getWazuhIntegrationStatus(session.organizationId),
    listWazuhAgentsWithMappings(session.organizationId).catch(() => []),
    prisma.client.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.asset.findMany({
      where: {
        organizationId: session.organizationId,
        type: {
          in: ["SERVER", "WORKSTATION", "NETWORK_DEVICE", "IOT_DEVICE", "OTHER"],
        },
      },
      select: { id: true, name: true, clientId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <WazuhIntegrationClient
      status={status}
      agents={agents}
      clients={clients}
      assets={assets}
      canSync={canSync}
      canMapAgents={canMapAgents}
    />
  );
}
