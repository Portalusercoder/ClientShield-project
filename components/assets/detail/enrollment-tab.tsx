import Link from "next/link";
import { EndpointEnrollmentPanel } from "@/components/wazuh/endpoint-enrollment-panel";
import type { AssetDetail } from "@/types/asset";
import type {
  EndpointWazuhReadiness,
  WazuhAgentEnrollmentRecord,
} from "@/types/wazuh-enrollment";

interface EnrollmentTabProps {
  asset: AssetDetail;
  canManageEnrollment: boolean;
  endpointReadiness?: EndpointWazuhReadiness | null;
  enrollments: WazuhAgentEnrollmentRecord[];
}

export function EnrollmentTab({
  asset,
  canManageEnrollment,
  endpointReadiness,
  enrollments,
}: EnrollmentTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Remote Wazuh agent enrollment for this endpoint.
        </p>
        <Link
          href={`/assets/${asset.id}/enrollment`}
          className="text-sm text-accent hover:underline"
        >
          Dedicated enrollment page
        </Link>
      </div>
      <EndpointEnrollmentPanel
        assetId={asset.id}
        assetName={asset.name}
        defaultHostname={asset.hostname}
        authorizationStatus={asset.authorizationStatus}
        canManage={canManageEnrollment}
        readiness={endpointReadiness ?? null}
        enrollments={enrollments}
      />
    </div>
  );
}
