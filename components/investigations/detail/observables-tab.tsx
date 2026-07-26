"use client";

import { manualThreatIntelLookupAction } from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import type { TabBaseProps } from "./shared";

export function ObservablesTab({
  investigation,
  canAct,
  isPending,
  runAction,
}: TabBaseProps) {
  return (
    <div className="space-y-4">
      {investigation.observables.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted">
          No observables extracted for events in this investigation.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {investigation.observables.map((obs) => (
                <tr key={obs.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {obs.type}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {obs.value}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {obs.roles.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canAct &&
                    obs.safeForExternalLookup &&
                    investigation.threatIntelEnabled ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Look up threat intelligence for public observable?\n\n${obs.type}: ${obs.value}\n\nThis may send the value to an external provider.`
                            )
                          ) {
                            return;
                          }
                          const fd = new FormData();
                          fd.set("observableId", obs.id);
                          fd.set("groupId", investigation.id);
                          fd.set("confirm", "true");
                          runAction(
                            () => manualThreatIntelLookupAction(fd),
                            "Threat intel lookup requested"
                          );
                        }}
                      >
                        Check Threat Intelligence
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">
                        {!investigation.threatIntelEnabled
                          ? "Threat intel disabled"
                          : obs.unsafeReason ?? "Not eligible for lookup"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
