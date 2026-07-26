import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { continueDevBypassAction } from "@/app/(auth)/actions";
import {
  isAuthDevBypassEnabled,
  resolveAuthRuntimeMode,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";
import { clearDevBypassSignedOut } from "@/lib/auth/dev-bypass-logout";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

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
    await clearDevBypassSignedOut();
    await signIn("auth0", { redirectTo: returnTo });
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-accent-muted),_transparent_55%)]"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md space-y-6 rounded-[10px] border border-border bg-surface p-8 shadow-card">
        <div className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/6degrees-logo.png"
            alt="6 degrees"
            width={200}
            height={43}
            className="mx-auto h-9 w-auto"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            SOC access requires a provisioned ClientShield user linked to your
            identity provider account.
          </p>
        </div>

        {mode === "auth0" ? (
          <form action={startAuth0Login}>
            <Button type="submit" className="w-full" size="lg">
              Continue with Auth0
            </Button>
          </form>
        ) : bypass ? (
          <div className="space-y-4 text-sm text-muted">
            <p>
              Development bypass is enabled (`AUTH_DEV_BYPASS`). Sign out ends
              the local bypass session until you continue below.
            </p>
            <form action={continueDevBypassAction}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button type="submit" className="w-full" size="lg">
                Continue to app
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-danger">
            <p>Authentication is not configured for this environment.</p>
            <p className="text-muted">
              Set Auth0 credentials and `AUTH_SECRET`, or enable
              `AUTH_DEV_BYPASS=true` in development only.
            </p>
            <Link
              href="/unauthorized?reason=misconfigured"
              className="font-medium text-accent hover:underline"
            >
              Details
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
