"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOrganizationSettingsAction } from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { OrganizationSettingsRecord } from "@/types/client-onboarding";

interface OrganizationSettingsFormProps {
  settings: OrganizationSettingsRecord;
  canEdit: boolean;
}

export function OrganizationSettingsForm({
  settings,
  canEdit,
}: OrganizationSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization profile</CardTitle>
        <CardDescription>
          Tenant display settings only. Wazuh credentials stay in server
          environment configuration — never in the database.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit) return;
            setError(null);
            setSaved(false);
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await updateOrganizationSettingsAction(fd);
              if (result.success) {
                setSaved(true);
                router.refresh();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <Input
            name="displayName"
            label="Display name"
            defaultValue={settings.displayName ?? ""}
            disabled={!canEdit}
          />
          <Input
            name="defaultTimezone"
            label="Default timezone"
            defaultValue={settings.defaultTimezone ?? "UTC"}
            disabled={!canEdit}
          />
          <Input
            name="securityContactEmail"
            label="Security contact email"
            type="email"
            defaultValue={settings.securityContactEmail ?? ""}
            disabled={!canEdit}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          {saved && <p className="text-sm text-success">Settings saved.</p>}
          {canEdit && (
            <Button type="submit" disabled={isPending}>
              Save settings
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
