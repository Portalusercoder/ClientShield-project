"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSecurityCheckAction } from "@/app/(dashboard)/assets/security-check-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface RunSecurityCheckButtonProps {
  assetId: string;
  canRun: boolean;
  blockedReason?: string | null;
}

export function RunSecurityCheckButton({
  assetId,
  canRun,
  blockedReason,
}: RunSecurityCheckButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    setStatus("Running passive security check...");
    startTransition(async () => {
      const result = await runSecurityCheckAction(assetId);
      if (result.success) {
        setStatus(
          `Check completed. Score: ${result.data.score ?? "—"}/100`
        );
        setConfirmOpen(false);
        router.refresh();
      } else {
        setError(result.error);
        setStatus(null);
      }
    });
  }

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!canRun || isPending}
        >
          {isPending ? "Running..." : "Run Security Check"}
        </Button>
        {!canRun && blockedReason && (
          <p className="text-xs text-muted">{blockedReason}</p>
        )}
        {status && <p className="text-xs text-success">{status}</p>}
        {error && !confirmOpen && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Run Security Check</CardTitle>
              <CardDescription>
                This will perform passive HTTP, HTTPS, TLS, and security
                configuration checks against this authorized asset. No active
                vulnerability testing will be performed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              {isPending && (
                <p className="text-sm text-muted">
                  Running passive checks... this may take a few seconds.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={handleConfirm} disabled={isPending}>
                  {isPending ? "Running..." : "Confirm & Run"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
