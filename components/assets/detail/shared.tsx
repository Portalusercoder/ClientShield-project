import type { AssetDetail } from "@/types/asset";

export function InfoItem({
  label,
  value,
  isLink,
}: {
  label: string;
  value: string | null;
  isLink?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {value ? (
          isLink ? (
            <a
              href={value.startsWith("http") ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {value.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}

export function getBlockedReason(asset: AssetDetail): string {
  if (asset.type !== "WEBSITE" && asset.type !== "WEB_APPLICATION") {
    return "Passive checks only support WEBSITE and WEB_APPLICATION assets.";
  }
  if (asset.authorizationStatus !== "AUTHORIZED") {
    return "Asset must be AUTHORIZED before running a security check.";
  }
  if (asset.monitoringStatus !== "ACTIVE") {
    return "Asset monitoring status must be ACTIVE.";
  }
  if (!asset.url) {
    return "Asset needs a stored URL before a security check can run.";
  }
  return "Unable to run security check.";
}
