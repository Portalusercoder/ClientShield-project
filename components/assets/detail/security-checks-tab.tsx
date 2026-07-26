import { SecurityChecksPanel } from "@/components/assets/security-checks-panel";
import { ZapScansPanel } from "@/components/assets/zap-scans-panel";
import type { SecurityCheckListItem } from "@/types/security-check";
import type { ZapScanListItem } from "@/types/zap";

interface SecurityChecksTabProps {
  securityChecks: SecurityCheckListItem[];
  zapScans: ZapScanListItem[];
}

export function SecurityChecksTab({
  securityChecks,
  zapScans,
}: SecurityChecksTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-sm font-medium text-foreground">
          Passive Security Checks
        </h2>
        <p className="mb-4 text-xs text-muted">
          HTTPS, TLS, headers, and cookie configuration observations.
        </p>
        <SecurityChecksPanel checks={securityChecks} />
      </div>
      <div>
        <h2 className="mb-1 text-sm font-medium text-foreground">
          ZAP Baseline Scans
        </h2>
        <p className="mb-4 text-xs text-muted">
          OWASP ZAP spider + passive alerts only. Active Scan is not used.
        </p>
        <ZapScansPanel scans={zapScans} />
      </div>
    </div>
  );
}
