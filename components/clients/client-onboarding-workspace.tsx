"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  completeOnboardingAction,
  createClientContactAction,
  enableClientServiceAction,
  updateAssetAuthorizationAction,
  updateClientAction,
  updateOnboardingStepAction,
} from "@/app/(dashboard)/clients/actions";
import { AssetFormModal } from "@/components/assets/asset-form-modal";
import {
  AssetAuthorizationBadge,
  AssetTypeBadge,
} from "@/components/assets/asset-badges";
import {
  OnboardingStatusBadge,
  ReadinessBadge,
} from "@/components/clients/client-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssetListItem } from "@/types/asset";
import type { ClientDetail } from "@/types/client";
import type {
  ClientContactRecord,
  ClientOnboardingRecord,
  ClientReadinessResult,
  ClientServiceRecord,
  WazuhReadinessResult,
} from "@/types/client-onboarding";
import { ONBOARDING_STEPS, SERVICE_CATALOG } from "@/types/client-onboarding";
import type { ClientOnboardingStep } from "@prisma/client";

const STEP_LABELS: Record<ClientOnboardingStep, string> = {
  CLIENT_PROFILE: "Client profile",
  CONTACTS: "Contacts",
  SECURITY_SCOPE: "Security scope",
  ASSETS: "Assets",
  SERVICES: "Services",
  AUTHORIZATION: "Authorization",
  REVIEW: "Review",
};

const SERVICE_LABELS: Record<(typeof SERVICE_CATALOG)[number], string> = {
  PASSIVE_WEB_MONITORING: "Passive Web Monitoring",
  ZAP_BASELINE: "ZAP Baseline",
  WAZUH_ENDPOINT_MONITORING: "Wazuh Endpoint Monitoring",
  SECURITY_EVENT_MONITORING: "Security Event Monitoring",
  INCIDENT_RESPONSE: "Incident Response",
  REPORTING: "Reporting",
};

interface ClientOnboardingWorkspaceProps {
  client: ClientDetail;
  assets: AssetListItem[];
  contacts: ClientContactRecord[];
  services: ClientServiceRecord[];
  onboarding: ClientOnboardingRecord;
  readiness: ClientReadinessResult | null;
  wazuhReadiness: WazuhReadinessResult | null;
  canManage: boolean;
  canCreateAsset: boolean;
}

export function ClientOnboardingWorkspace({
  client,
  assets,
  contacts,
  services,
  onboarding,
  readiness,
  wazuhReadiness,
  canManage,
  canCreateAsset,
}: ClientOnboardingWorkspaceProps) {
  const router = useRouter();
  const [step, setStep] = useState<ClientOnboardingStep>(
    onboarding.currentStep
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const stepIndex = useMemo(
    () => Math.max(0, ONBOARDING_STEPS.indexOf(step)),
    [step]
  );

  function goToStep(next: ClientOnboardingStep) {
    setStep(next);
    if (!canManage || onboarding.status === "COMPLETED") return;
    startTransition(async () => {
      await updateOnboardingStepAction(client.id, next);
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        setMessage("Saved");
        router.refresh();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href={`/clients/${client.id}`} className="hover:text-accent">
              ← {client.name}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Client onboarding
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <OnboardingStatusBadge status={onboarding.status} />
            <ReadinessBadge overall={readiness?.overall} />
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      )}

      <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ONBOARDING_STEPS.map((s, idx) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => goToStep(s)}
              className={`w-full rounded-md border px-2 py-2 text-left text-xs ${
                s === step
                  ? "border-accent bg-accent/10 text-accent"
                  : idx < stepIndex
                    ? "border-border text-foreground"
                    : "border-border text-muted"
              }`}
            >
              <span className="block font-medium">{idx + 1}</span>
              {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>

      {readiness?.blockers?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current blockers</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {readiness.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {step === "CLIENT_PROFILE" && (
        <Card>
          <CardHeader>
            <CardTitle>Client profile</CardTitle>
            <CardDescription>Who is the customer organization?</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!canManage) return;
                const fd = new FormData(e.currentTarget);
                run(() => updateClientAction(client.id, fd));
              }}
            >
              <Input name="name" label="Name" defaultValue={client.name} required />
              <Input
                name="industry"
                label="Industry"
                defaultValue={client.industry ?? ""}
              />
              <Input
                name="country"
                label="Country"
                defaultValue={client.country ?? ""}
              />
              <Input
                name="timezone"
                label="Timezone"
                defaultValue={client.timezone ?? ""}
              />
              <Input
                name="website"
                label="Website"
                defaultValue={client.website ?? ""}
              />
              <Input
                name="phone"
                label="Phone"
                defaultValue={client.phone ?? ""}
              />
              {canManage && (
                <div className="sm:col-span-2 flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    Save profile
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => goToStep("CONTACTS")}
                  >
                    Continue
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {step === "CONTACTS" && (
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>
              Customer contacts are not ClientShield login users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-muted">
                  {c.email} · {c.contactType}
                  {c.isPrimary ? " · Primary" : ""}
                </p>
              </div>
            ))}
            {canManage && (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(() => createClientContactAction(client.id, fd));
                  e.currentTarget.reset();
                }}
              >
                <Input name="name" label="Name" required />
                <Input name="email" label="Email" type="email" required />
                <Select
                  name="contactType"
                  label="Type"
                  defaultValue="PRIMARY"
                  options={[
                    { value: "PRIMARY", label: "Primary" },
                    { value: "TECHNICAL", label: "Technical" },
                    { value: "SECURITY", label: "Security" },
                    { value: "OTHER", label: "Other" },
                  ]}
                />
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" name="isPrimary" value="true" defaultChecked />
                  Primary
                </label>
                <div className="sm:col-span-2 flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    Add contact
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => goToStep("SECURITY_SCOPE")}
                  >
                    Continue
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {step === "SECURITY_SCOPE" && (
        <Card>
          <CardHeader>
            <CardTitle>Security scope</CardTitle>
            <CardDescription>
              Scope is derived from assets and services — not duplicated records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Assets in scope: {assets.length}</p>
            <p>
              Websites/apps:{" "}
              {
                assets.filter(
                  (a) =>
                    a.type === "WEBSITE" || a.type === "WEB_APPLICATION"
                ).length
              }
            </p>
            <p>
              Endpoints:{" "}
              {
                assets.filter(
                  (a) => a.type === "WORKSTATION" || a.type === "SERVER"
                ).length
              }
            </p>
            <p>Services configured: {services.length}</p>
            <Button variant="secondary" onClick={() => goToStep("ASSETS")}>
              Continue to assets
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "ASSETS" && (
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>
              Add systems that ClientShield is authorized to monitor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assets.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{a.name}</p>
                  <AssetTypeBadge type={a.type} />
                </div>
                <AssetAuthorizationBadge status={a.authorizationStatus} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {canCreateAsset && (
                <Button onClick={() => setAddAssetOpen(true)}>Add asset</Button>
              )}
              <Button variant="secondary" onClick={() => goToStep("SERVICES")}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "SERVICES" && (
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>
              Select monitoring capabilities. Enabling ≠ technically ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {SERVICE_CATALOG.map((serviceType) => {
              const existing = services.find((s) => s.serviceType === serviceType);
              return (
                <div
                  key={serviceType}
                  className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {SERVICE_LABELS[serviceType]}
                    </p>
                    <p className="text-xs text-muted">
                      {existing?.status ?? "Not configured"}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      disabled={isPending || existing?.status === "ACTIVE"}
                      onClick={() =>
                        run(() =>
                          enableClientServiceAction(client.id, serviceType)
                        )
                      }
                    >
                      Enable
                    </Button>
                  )}
                </div>
              );
            })}
            {wazuhReadiness && (
              <p className="text-sm text-muted">
                Wazuh: {wazuhReadiness.status} — {wazuhReadiness.message}
              </p>
            )}
            <Button variant="secondary" onClick={() => goToStep("AUTHORIZATION")}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "AUTHORIZATION" && (
        <Card>
          <CardHeader>
            <CardTitle>Authorization</CardTitle>
            <CardDescription>
              Authorization confirms permission to monitor or assess an asset.
              Never auto-authorized.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assets.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <AssetAuthorizationBadge status={a.authorizationStatus} />
                </div>
                {canManage && a.authorizationStatus !== "AUTHORIZED" && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        updateAssetAuthorizationAction(
                          a.id,
                          client.id,
                          "AUTHORIZED"
                        )
                      )
                    }
                  >
                    Mark authorized
                  </Button>
                )}
              </div>
            ))}
            <Button variant="secondary" onClick={() => goToStep("REVIEW")}>
              Continue to review
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "REVIEW" && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              Complete onboarding only when readiness is READY.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              {readiness?.checks.map((c) => (
                <li key={c.key}>
                  <span className={c.passed ? "text-success" : "text-warning"}>
                    {c.passed ? "✓" : "•"}
                  </span>{" "}
                  {c.label}: {c.message}
                </li>
              ))}
            </ul>
            {canManage && (
              <>
                {!confirmComplete ? (
                  <Button
                    disabled={isPending || readiness?.overall !== "READY"}
                    onClick={() => setConfirmComplete(true)}
                  >
                    Complete onboarding
                  </Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        run(async () => {
                          const result = await completeOnboardingAction(
                            client.id
                          );
                          if (result.success) {
                            setConfirmComplete(false);
                            router.push(`/clients/${client.id}`);
                          }
                          return result;
                        })
                      }
                    >
                      Confirm complete
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmComplete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                {readiness?.overall !== "READY" && (
                  <p className="text-sm text-muted">
                    Resolve blockers before completing onboarding. Completing
                    does not deploy agents or run scans.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AssetFormModal
        open={addAssetOpen}
        onClose={() => setAddAssetOpen(false)}
        clients={[{ id: client.id, name: client.name }]}
        defaultClientId={client.id}
      />
    </div>
  );
}
