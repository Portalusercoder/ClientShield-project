"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createOrganizationUserAction,
  linkUserExternalIdAction,
  setUserDisabledAction,
} from "@/app/(dashboard)/settings/users/actions";
import type { OrganizationUserListItem } from "@/types/client-onboarding";

interface UsersAdminClientProps {
  users: OrganizationUserListItem[];
  canManage: boolean;
  canCreateOwner: boolean;
}

export function UsersAdminClient({
  users,
  canManage,
  canCreateOwner,
}: UsersAdminClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState(users[0]?.id ?? "");
  const [externalId, setExternalId] = useState("");

  return (
    <div className="space-y-8">
      {message && <p className="text-sm text-muted">{message}</p>}

      {users.length === 0 ? (
        <p className="text-sm text-muted">No users found for this organization.</p>
      ) : (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-3 font-medium text-muted">Name</th>
              <th className="px-4 py-3 font-medium text-muted">Email</th>
              <th className="px-4 py-3 font-medium text-muted">Role</th>
              <th className="px-4 py-3 font-medium text-muted">External ID</th>
              <th className="px-4 py-3 font-medium text-muted">Status</th>
              {canManage && (
                <th className="px-4 py-3 font-medium text-muted">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">{user.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="max-w-[12rem] truncate px-4 py-3 font-mono text-xs text-muted">
                  {user.externalId ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted">{user.status}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await setUserDisabledAction({
                            userId: user.id,
                            disabled: user.status === "ACTIVE",
                          });
                          setMessage(
                            res.success
                              ? `Updated ${user.email}`
                              : res.error
                          );
                          router.refresh();
                        })
                      }
                    >
                      {user.status === "ACTIVE" ? "Disable" : "Enable"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {canManage && (
        <div className="grid gap-6 md:grid-cols-2">
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                const res = await createOrganizationUserAction({
                  email: String(fd.get("email") ?? ""),
                  name: String(fd.get("name") ?? "") || null,
                  role: String(fd.get("role") ?? "VIEWER") as
                    | "VIEWER"
                    | "ANALYST"
                    | "ADMIN"
                    | "OWNER",
                });
                setMessage(
                  res.success
                    ? `Created user ${res.userId}`
                    : res.error
                );
                if (res.success) {
                  e.currentTarget.reset();
                  router.refresh();
                }
              });
            }}
          >
            <h3 className="text-sm font-medium text-foreground">Create user</h3>
            <p className="text-xs text-muted">
              Creates a local ClientShield user. Link an IdP external ID before
              they can sign in with Auth0.
            </p>
            <input
              name="email"
              type="email"
              required
              placeholder="email@company.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              name="name"
              type="text"
              placeholder="Display name"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              name="role"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue="ANALYST"
            >
              <option value="VIEWER">VIEWER</option>
              <option value="ANALYST">ANALYST</option>
              <option value="ADMIN">ADMIN</option>
              {canCreateOwner && <option value="OWNER">OWNER</option>}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create user
            </button>
          </form>

          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await linkUserExternalIdAction({
                  userId: linkUserId,
                  externalId,
                });
                setMessage(res.success ? "Identity linked" : res.error);
                if (res.success) {
                  setExternalId("");
                  router.refresh();
                }
              });
            }}
          >
            <h3 className="text-sm font-medium text-foreground">
              Link IdP external ID
            </h3>
            <p className="text-xs text-muted">
              Use the Auth0 user `sub` (subject). No automatic email linking.
            </p>
            <select
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} ({u.role})
                </option>
              ))}
            </select>
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              required
              placeholder="auth0|..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={pending || !linkUserId}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
            >
              Link external ID
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
