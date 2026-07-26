import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvestigationDetailViewModel } from "@/types/investigations";

export function MitreTab({
  investigation,
}: {
  investigation: InvestigationDetailViewModel;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>MITRE ATT&CK</CardTitle>
        <CardDescription>
          Aggregated tactics and techniques from member events
        </CardDescription>
      </CardHeader>
      <CardContent>
        {investigation.mitreTactics.length === 0 &&
        investigation.mitreTechniques.length === 0 ? (
          <p className="text-sm text-muted">
            No MITRE tactics or techniques recorded for events in this
            investigation.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
                Tactics
              </h3>
              {investigation.mitreTactics.length === 0 ? (
                <p className="text-sm text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {investigation.mitreTactics.map((t) => (
                    <li
                      key={t}
                      className="rounded border border-border px-2 py-1 font-mono text-xs"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
                Techniques
              </h3>
              {investigation.mitreTechniques.length === 0 ? (
                <p className="text-sm text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {investigation.mitreTechniques.map((t) => (
                    <li
                      key={t}
                      className="rounded border border-border px-2 py-1 font-mono text-xs"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
