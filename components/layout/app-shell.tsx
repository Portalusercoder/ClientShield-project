"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type ShellContextValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

const STORAGE_KEY = "cs-sidebar-collapsed";

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within AppShell");
  }
  return ctx;
}

export function AppShell({
  children,
  sidebar,
  header,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsedState(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <ShellContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed,
        mobileOpen,
        setMobileOpen,
      }}
    >
      <div
        className="flex min-h-screen bg-background"
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        data-shell-ready={ready ? "true" : "false"}
      >
        {sidebar}
        <div
          className={
            collapsed
              ? "flex min-w-0 flex-1 flex-col lg:pl-16"
              : "flex min-w-0 flex-1 flex-col lg:pl-60"
          }
        >
          {header}
          <main className="flex-1 overflow-auto px-4 py-6 md:px-6 md:py-8 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
