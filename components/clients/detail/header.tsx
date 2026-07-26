import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ClientStatusBadge,
  OnboardingStatusBadge,
  ReadinessBadge,
} from "@/components/clients/client-status-badge";
import type { ClientDetail } from "@/types/client";

interface ClientDetailHeaderProps {
  client: ClientDetail;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
}

export function ClientDetailHeader({
  client,
  canEdit,
  canArchive,
  onEdit,
  onArchive,
}: ClientDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            {client.name}
          </h1>
          <ClientStatusBadge status={client.status} />
          <OnboardingStatusBadge status={client.onboardingStatus} />
          <ReadinessBadge overall={client.readinessSummary?.overall} />
        </div>
        {client.industry && (
          <p className="mt-1 text-sm text-muted">{client.industry}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/clients/${client.id}/onboarding`}>
          <Button variant="secondary">Onboarding</Button>
        </Link>
        {canEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Edit Client
          </Button>
        )}
        {canArchive &&
          client.status !== "OFFBOARDED" &&
          client.status !== "INACTIVE" && (
            <Button variant="danger" onClick={onArchive}>
              Offboard
            </Button>
          )}
      </div>
    </div>
  );
}
