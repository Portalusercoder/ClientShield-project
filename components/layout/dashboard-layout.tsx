import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getSession } from "@/lib/auth/session";

interface DashboardLayoutProps {
  children: ReactNode;
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col lg:pl-64">
        <Header
          userName={session?.name ?? session?.email ?? null}
          userEmail={session?.email ?? null}
          userRole={session?.role ?? null}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
