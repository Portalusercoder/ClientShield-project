import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetListItem } from "@/types/asset";
import type { ClientServiceRecord } from "@/types/client-onboarding";

interface ScopeTabProps {
  assets: AssetListItem[];
  services: ClientServiceRecord[];
}

export function ScopeTab({ assets, services }: ScopeTabProps) {
  const websiteAssets = assets.filter(
    (a) => a.type === "WEBSITE" || a.type === "WEB_APPLICATION"
  );
  const endpointAssets = assets.filter(
    (a) => a.type === "WORKSTATION" || a.type === "SERVER"
  );
  const networkAssets = assets.filter((a) => a.type === "NETWORK_DEVICE");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[
        { label: "Websites / apps", count: websiteAssets.length },
        { label: "Endpoints", count: endpointAssets.length },
        { label: "Network devices", count: networkAssets.length },
        { label: "Authorized assets", count: assets.filter((a) => a.authorizationStatus === "AUTHORIZED").length },
        { label: "Pending authorization", count: assets.filter((a) => a.authorizationStatus === "PENDING").length },
        { label: "Active services", count: services.filter((s) => s.status === "ACTIVE").length },
      ].map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle className="text-base">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{item.count}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
