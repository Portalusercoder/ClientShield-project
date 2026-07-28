import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getSession } from "@/lib/auth/session";

interface DashboardLayoutProps {
  children: ReactNode;
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await getSession();

  return (
    <AppShell
      sidebar={<Sidebar role={session?.role ?? null} />}
      header={
        <Header
          userName={session?.name ?? session?.email ?? null}
          userEmail={session?.email ?? null}
          userRole={session?.role ?? null}
        />
      }
    >
      {children}
    </AppShell>
  );
}
