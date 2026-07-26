import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingStatusBadge } from "@/components/clients/client-status-badge";
import { formatDate } from "@/lib/utils";
import type { ClientDetail } from "@/types/client";
import type {
  ClientOnboardingRecord,
  ClientReadinessResult,
} from "@/types/client-onboarding";

interface OnboardingTabProps {
  client: ClientDetail;
  onboarding: ClientOnboardingRecord | null;
  readiness: ClientReadinessResult | null;
}

export function OnboardingTab({
  client,
  onboarding,
  readiness,
}: OnboardingTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding status</CardTitle>
        <CardDescription>
          Guided setup lives on the onboarding workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="mt-1">
              <OnboardingStatusBadge status={onboarding?.status ?? null} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Current step</dt>
            <dd className="mt-1 text-foreground">
              {onboarding?.currentStep ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Completed</dt>
            <dd className="mt-1 text-foreground">
              {onboarding?.completedAt
                ? formatDate(onboarding.completedAt)
                : "—"}
            </dd>
          </div>
        </dl>
        {readiness?.blockers?.length ? (
          <div>
            <p className="text-sm font-medium text-foreground">Blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {readiness.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href={`/clients/${client.id}/onboarding`}>
          <Button>Open onboarding workspace</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
