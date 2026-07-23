import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EndpointEnrollmentPanel } from "@/components/wazuh/endpoint-enrollment-panel";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { getAssetById } from "@/services/assets.service";
import {
  calculateEndpointWazuhReadiness,
  listEnrollmentsForAsset,
} from "@/services/wazuh/wazuh-enrollment.service";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const asset = await getAssetById(session.organizationId, id);
  return {
    title: asset ? `Enrollment · ${asset.name}` : "Endpoint Enrollment",
  };
}

export default async function AssetEnrollmentPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const asset = await getAssetById(session.organizationId, id);
  if (!asset) notFound();

  if (asset.type !== "WORKSTATION" && asset.type !== "SERVER") {
    notFound();
  }

  const [enrollments, readiness] = await Promise.all([
    listEnrollmentsForAsset(session.organizationId, asset.id),
    calculateEndpointWazuhReadiness(session.organizationId, asset.id),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        <Link href={`/assets/${asset.id}`} className="hover:text-accent">
          ← {asset.name}
        </Link>
      </p>
      <EndpointEnrollmentPanel
        assetId={asset.id}
        assetName={asset.name}
        defaultHostname={asset.hostname}
        authorizationStatus={asset.authorizationStatus}
        canManage={hasMinimumRole(session, "ADMIN")}
        readiness={readiness}
        enrollments={enrollments}
      />
    </div>
  );
}
