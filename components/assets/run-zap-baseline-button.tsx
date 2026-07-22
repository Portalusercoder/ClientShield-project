"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runZapBaselineScanAction } from "@/app/(dashboard)/assets/zap-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface RunZapBaselineButtonProps {
  assetId: string;
  canRun: boolean;
  blockedReason?: string | null;
}

export function RunZapBaselineButton({
  assetId,
  canRun,
  blockedReason,
}: RunZapBaselineButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    setStatus("Running ZAP baseline scan… this may take a few minutes.");
    startTransition(async () => {
      const result = await runZapBaselineScanAction(assetId);
      if (result.success) {
        setStatus(
          `ZAP baseline ${result.data.status.toLowerCase()}. Findings created: ${result.data.findingsCreated}, updated: ${result.data.findingsUpdated}.`
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
          variant="secondary"
          onClick={() => setConfirmOpen(true)}
          disabled={!canRun || isPending}
        >
          {isPending ? "Scanning…" : "Run ZAP Baseline Scan"}
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
              <CardTitle>Run ZAP Baseline Scan</CardTitle>
              <CardDescription>
                This will run an OWASP ZAP baseline assessment against this
                authorized website. The scan uses passive analysis and does not
                perform active vulnerability attacks. The target may receive
                normal automated HTTP requests during crawling.
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
                  Spidering and passive scanning in progress. Please wait…
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
                  {isPending ? "Running…" : "Confirm & Run"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
