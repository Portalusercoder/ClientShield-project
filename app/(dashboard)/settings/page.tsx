import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Organization settings, roles, and integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Read-only security telemetry integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/integrations/wazuh"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated hover:text-accent"
          >
            Wazuh Integration
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
