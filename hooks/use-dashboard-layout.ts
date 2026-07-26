"use client";

import { useCallback, useEffect, useState } from "react";

export type DashboardSectionDef<T extends string> = {
  id: T;
  label: string;
  description?: string;
  /** Shown when prefs are missing or reset */
  defaultVisible: boolean;
};

export function useDashboardLayout<T extends string>(
  storageKey: string,
  sections: readonly DashboardSectionDef<T>[]
) {
  const defaults = Object.fromEntries(
    sections.map((s) => [s.id, s.defaultVisible])
  ) as Record<T, boolean>;

  const [visible, setVisible] = useState<Record<T, boolean>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<T, boolean>>;
        const next = { ...defaults };
        for (const section of sections) {
          if (typeof parsed[section.id] === "boolean") {
            next[section.id] = parsed[section.id]!;
          }
        }
        setVisible(next);
      }
    } catch {
      /* ignore corrupt prefs */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per key
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<T, boolean>) => {
      setVisible(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
    },
    [storageKey]
  );

  const isVisible = useCallback(
    (id: T) => (hydrated ? visible[id] !== false : defaults[id] !== false),
    [hydrated, visible, defaults]
  );

  const setSection = useCallback(
    (id: T, on: boolean) => {
      persist({ ...visible, [id]: on });
    },
    [persist, visible]
  );

  const setAll = useCallback(
    (on: boolean) => {
      const next = Object.fromEntries(
        sections.map((s) => [s.id, on])
      ) as Record<T, boolean>;
      persist(next);
    },
    [persist, sections]
  );

  const reset = useCallback(() => {
    persist({ ...defaults });
  }, [persist, defaults]);

  const hiddenCount = sections.filter((s) => !isVisible(s.id)).length;

  return {
    sections,
    visible,
    hydrated,
    isVisible,
    setSection,
    setAll,
    reset,
    hiddenCount,
  };
}
