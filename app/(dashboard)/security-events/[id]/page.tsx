import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SecurityEventDetailView } from "@/components/security-events/security-event-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { getSecurityEventDetail } from "@/services/security-events.service";

export const metadata: Metadata = {
  title: "Security Event",
};

export const dynamic = "force-dynamic";

interface SecurityEventDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SecurityEventDetailPage({
  params,
}: SecurityEventDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const event = await getSecurityEventDetail(session.organizationId, id);
  if (!event) notFound();

  const canTriage = hasMinimumRole(session, "ANALYST");

  return (
    <SecurityEventDetailView event={event} canTriage={canTriage} />
  );
}
