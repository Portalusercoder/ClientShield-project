import { formatDateTime } from "@/lib/utils";
import type { InvestigationDetailViewModel } from "@/types/investigations";

export function ThreatIntelTab({
  investigation,
}: {
  investigation: InvestigationDetailViewModel;
}) {
  return (
    <div className="space-y-4">
      {!investigation.threatIntelConfigured && (
        <div className="rounded-md border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
          Threat intelligence provider is not configured. Lookups are
          disabled or will return an unconfigured response until a provider
          is set.
        </div>
      )}
      {!investigation.threatIntelEnabled && (
        <div className="rounded-md border border-border bg-surface/40 px-4 py-3 text-sm text-muted">
          Threat intelligence lookups are disabled for this environment.
        </div>
      )}
      {investigation.threatIntelLookups.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
          No threat intelligence lookups recorded for observables in this
          investigation.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Looked up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {investigation.threatIntelLookups.map((row) => {
                const obs = investigation.observables.find(
                  (o) => o.id === row.observableId
                );
                return (
                  <tr key={row.id} className="hover:bg-surface/40">
                    <td className="px-4 py-3">
                      <div className="text-sm">{row.provider}</div>
                      {obs && (
                        <div className="font-mono text-xs text-muted">
                          {obs.type}: {obs.value}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.status}</td>
                    <td className="px-4 py-3 text-muted">
                      {row.riskLevel ?? "—"}
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-xs text-muted">
                      {row.summary ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDateTime(row.lookedUpAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
