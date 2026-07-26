import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { AssetFindingItem } from "./types";

export function FindingsTab({ findings }: { findings: AssetFindingItem[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="No findings for this asset"
        description="Passive configuration findings from security checks will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Finding</th>
            <th className="px-4 py-3 font-medium text-muted">Severity</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Source
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Instances
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              First Detected
            </th>
            <th className="px-4 py-3 font-medium text-muted">Last Detected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((finding) => (
            <tr key={finding.id} className="bg-surface">
              <td className="px-4 py-3">
                <Link
                  href={`/vulnerabilities/${finding.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {finding.title}
                </Link>
                {finding.code && (
                  <p className="text-xs text-muted">{finding.code}</p>
                )}
              </td>
              <td className="px-4 py-3">{finding.severity}</td>
              <td className="px-4 py-3">{finding.status}</td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">
                {finding.source ?? "—"}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted md:table-cell">
                {finding.instanceCount && finding.instanceCount > 0
                  ? finding.instanceCount
                  : "—"}
              </td>
              <td className="hidden px-4 py-3 text-muted md:table-cell">
                {formatDate(
                  finding.firstDetectedAt ?? finding.createdAt ?? new Date()
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatDate(
                  finding.lastDetectedAt ??
                    finding.firstDetectedAt ??
                    finding.createdAt ??
                    new Date()
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
