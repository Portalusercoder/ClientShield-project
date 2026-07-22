"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ClientStatus } from "@prisma/client";
import {
  createClientAction,
  updateClientAction,
} from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type { ClientDetail } from "@/types/client";

const CREATE_STATUS_OPTIONS = [
  { value: "ONBOARDING", label: "Onboarding" },
];

const EDIT_STATUS_OPTIONS = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "OFFBOARDED", label: "Offboarded" },
  { value: "INACTIVE", label: "Inactive" },
];

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  client?: ClientDetail;
  onSuccess?: (clientId: string) => void;
}

export function ClientFormModal({
  open,
  onClose,
  client,
  onSuccess,
}: ClientFormModalProps) {
  const router = useRouter();
  const isEditing = Boolean(client);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEditing
        ? await updateClientAction(client!.id, formData)
        : await createClientAction(formData);

      if (result.success) {
        onSuccess?.(result.data.id);
        onClose();
        if (
          !isEditing &&
          "redirectTo" in result.data &&
          typeof result.data.redirectTo === "string"
        ) {
          router.push(result.data.redirectTo);
        } else {
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Client" : "Add Client"}
      description={
        isEditing
          ? "Update client profile information. Status changes follow lifecycle rules and are audited."
          : "Register a new client. You will continue to the onboarding workspace after creation."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Input
          label="Client Name"
          name="name"
          required
          defaultValue={client?.name}
          placeholder="Acme Corporation"
          disabled={isPending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Industry (optional)"
            name="industry"
            defaultValue={client?.industry ?? ""}
            placeholder="Technology, Healthcare, Finance..."
            disabled={isPending}
          />
          <Input
            label="Country (optional)"
            name="country"
            defaultValue={client?.country ?? ""}
            placeholder="United States"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Primary Contact Name"
            name="primaryContactName"
            defaultValue={client?.primaryContactName ?? ""}
            disabled={isPending}
          />
          <Input
            label="Primary Contact Email"
            name="primaryContactEmail"
            type="email"
            defaultValue={client?.primaryContactEmail ?? ""}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={client?.phone ?? ""}
            disabled={isPending}
          />
          <Input
            label="Website (optional)"
            name="website"
            type="url"
            defaultValue={client?.website ?? ""}
            placeholder="example.com"
            disabled={isPending}
          />
        </div>

        <Input
          label="Timezone (optional)"
          name="timezone"
          defaultValue={client?.timezone ?? ""}
          placeholder="UTC, America/New_York..."
          disabled={isPending}
        />

        <Select
          label="Status"
          name="status"
          defaultValue={(client?.status ?? "ONBOARDING") as ClientStatus}
          options={isEditing ? EDIT_STATUS_OPTIONS : CREATE_STATUS_OPTIONS}
          disabled={isPending || !isEditing}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save Changes"
                : "Add Client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
