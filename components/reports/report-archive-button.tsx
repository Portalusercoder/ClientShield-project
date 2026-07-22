"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { archiveReportAction } from "@/app/(dashboard)/reports/actions";
import { Button } from "@/components/ui/button";

export function ReportArchiveButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await archiveReportAction(reportId);
          router.refresh();
        })
      }
    >
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}
