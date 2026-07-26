import {
  disableClientServiceAction,
  enableClientServiceAction,
  pauseClientServiceAction,
} from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ClientServiceRecord } from "@/types/client-onboarding";
import { SERVICE_CATALOG } from "@/types/client-onboarding";
import { SERVICE_LABELS } from "./types";

interface ServicesTabProps {
  clientId: string;
  services: ClientServiceRecord[];
  canManageClient: boolean;
  isPending: boolean;
  runAction: (
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => void;
}

export function ServicesTab({
  clientId,
  services,
  canManageClient,
  isPending,
  runAction,
}: ServicesTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Enabling a service does not mean setup is complete. Readiness is
        calculated separately.
      </p>
      {SERVICE_CATALOG.map((serviceType) => {
        const existing = services.find((s) => s.serviceType === serviceType);
        return (
          <Card key={serviceType}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">
                  {SERVICE_LABELS[serviceType]}
                </p>
                <p className="text-sm text-muted">
                  Status: {existing?.status ?? "Not configured"}
                </p>
              </div>
              {canManageClient && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isPending || existing?.status === "ACTIVE"}
                    onClick={() =>
                      runAction(() =>
                        enableClientServiceAction(clientId, serviceType)
                      )
                    }
                  >
                    Enable
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending || !existing || existing.status === "PAUSED"}
                    onClick={() =>
                      runAction(() =>
                        pauseClientServiceAction(clientId, serviceType)
                      )
                    }
                  >
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending || !existing || existing.status === "DISABLED"}
                    onClick={() =>
                      runAction(() =>
                        disableClientServiceAction(clientId, serviceType)
                      )
                    }
                  >
                    Disable
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
