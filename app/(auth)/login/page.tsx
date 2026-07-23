import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import {
  isAuthDevBypassEnabled,
  resolveAuthRuntimeMode,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(
    typeof params.returnTo === "string" ? params.returnTo : "/"
  );

  const existing = await getSession();
  if (existing) {
    redirect(returnTo);
  }

  const mode = resolveAuthRuntimeMode();
  const bypass = isAuthDevBypassEnabled();

  async function startAuth0Login() {
    "use server";
    await signIn("auth0", { redirectTo: returnTo });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 border border-border bg-surface p-8">
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/clientshield-logo.svg"
            alt="ClientShield"
            width={48}
            height={52}
            className="mx-auto h-12 w-auto"
          />
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-sm text-muted">
            SOC access requires a provisioned ClientShield user linked to your
            identity provider account.
          </p>
        </div>

        {mode === "auth0" ? (
          <form action={startAuth0Login}>
            <button
              type="submit"
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Continue with Auth0
            </button>
          </form>
        ) : bypass ? (
          <div className="space-y-3 text-sm text-muted">
            <p>
              Development bypass is enabled (`AUTH_DEV_BYPASS`). Open the app
              directly — no IdP login required.
            </p>
            <Link
              href={returnTo}
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground"
            >
              Continue to app
            </Link>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-danger">
            <p>Authentication is not configured for this environment.</p>
            <p className="text-muted">
              Set Auth0 credentials and `AUTH_SECRET`, or enable
              `AUTH_DEV_BYPASS=true` in development only.
            </p>
            <Link href="/unauthorized?reason=misconfigured" className="text-accent">
              Details
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
