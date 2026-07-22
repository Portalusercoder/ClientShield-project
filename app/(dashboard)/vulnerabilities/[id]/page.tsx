import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FindingDetailView } from "@/components/findings/finding-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import {
  getFindingById,
  listFindingActivity,
  listFindingInstances,
  listOrgUsers,
} from "@/services/findings.service";

export const dynamic = "force-dynamic";

interface FindingDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: FindingDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const finding = await getFindingById(session.organizationId, id);
  return { title: finding ? finding.title : "Finding Not Found" };
}

export default async function FindingDetailPage({
  params,
  searchParams,
}: FindingDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const instancesPage =
    typeof sp.instancesPage === "string" ? Number(sp.instancesPage) || 1 : 1;
  const instancesPageSize = 25;

  const [finding, users, activity, instancePage] = await Promise.all([
    getFindingById(session.organizationId, id),
    listOrgUsers(session.organizationId),
    listFindingActivity(session.organizationId, id),
    listFindingInstances(session.organizationId, id, {
      page: instancesPage,
      pageSize: instancesPageSize,
    }),
  ]);

  if (!finding) {
    notFound();
  }

  return (
    <FindingDetailView
      finding={finding}
      users={users}
      activity={activity}
      instances={instancePage.instances}
      instancesTotal={instancePage.total}
      instancesPage={instancePage.page}
      instancesPageSize={instancesPageSize}
      canManage={hasMinimumRole(session, "ANALYST")}
      canVerify={hasMinimumRole(session, "ANALYST")}
      canAcceptRisk={hasMinimumRole(session, "ADMIN")}
    />
  );
}
