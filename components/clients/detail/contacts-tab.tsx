import {
  createClientContactAction,
  deleteClientContactAction,
} from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ClientContactRecord } from "@/types/client-onboarding";

interface ContactsTabProps {
  clientId: string;
  contacts: ClientContactRecord[];
  canManageClient: boolean;
  isPending: boolean;
  runAction: (
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => void;
}

export function ContactsTab({
  clientId,
  contacts,
  canManageClient,
  isPending,
  runAction,
}: ContactsTabProps) {
  return (
    <div className="space-y-4">
      {canManageClient && (
        <form
          className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            runAction(() => createClientContactAction(clientId, fd));
            e.currentTarget.reset();
          }}
        >
          <Input name="name" label="Name" required />
          <Input name="email" label="Email" type="email" required />
          <Input name="phone" label="Phone" />
          <Input name="jobTitle" label="Job title" />
          <Select
            name="contactType"
            label="Type"
            defaultValue="OTHER"
            options={[
              { value: "PRIMARY", label: "Primary" },
              { value: "TECHNICAL", label: "Technical" },
              { value: "SECURITY", label: "Security" },
              { value: "BILLING", label: "Billing" },
              { value: "EXECUTIVE", label: "Executive" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <label className="flex items-center gap-2 self-end text-sm text-foreground">
            <input type="checkbox" name="isPrimary" value="true" />
            Primary contact
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              Add contact
            </Button>
          </div>
        </form>
      )}
      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts"
          description="Client contacts do not receive ClientShield login access."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="px-4 py-3 font-medium text-muted">Name</th>
                <th className="px-4 py-3 font-medium text-muted">Email</th>
                <th className="px-4 py-3 font-medium text-muted">Type</th>
                <th className="px-4 py-3 font-medium text-muted">Primary</th>
                {canManageClient && (
                  <th className="px-4 py-3 font-medium text-muted">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.email}</td>
                  <td className="px-4 py-3">{c.contactType}</td>
                  <td className="px-4 py-3">{c.isPrimary ? "Yes" : "—"}</td>
                  {canManageClient && (
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={isPending}
                        onClick={() =>
                          runAction(() =>
                            deleteClientContactAction(c.id, clientId)
                          )
                        }
                      >
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
