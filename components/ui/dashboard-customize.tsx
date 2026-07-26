"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { DashboardSectionDef } from "@/hooks/use-dashboard-layout";

interface DashboardCustomizeProps<T extends string> {
  title?: string;
  description?: string;
  sections: readonly DashboardSectionDef<T>[];
  isVisible: (id: T) => boolean;
  setSection: (id: T, on: boolean) => void;
  setAll: (on: boolean) => void;
  reset: () => void;
  hiddenCount: number;
}

export function DashboardCustomize<T extends string>({
  title = "Customize layout",
  description = "Show or hide sections on this page. Preferences are saved in this browser.",
  sections,
  isVisible,
  setSection,
  setAll,
  reset,
  hiddenCount,
}: DashboardCustomizeProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Customize
        {hiddenCount > 0 ? (
          <span className="ml-1.5 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
            {hiddenCount} hidden
          </span>
        ) : null}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAll(true)}>
              Show all
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAll(false)}>
              Hide all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Reset defaults
            </Button>
          </div>

          <ul className="divide-y divide-border rounded-[8px] border border-border">
            {sections.map((section) => {
              const on = isVisible(section.id);
              return (
                <li key={section.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-surface-elevated/80">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                      checked={on}
                      onChange={(e) => setSection(section.id, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {section.label}
                      </span>
                      {section.description ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          {section.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
