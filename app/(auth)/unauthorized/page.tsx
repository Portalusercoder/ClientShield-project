import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unauthorized",
};

export const dynamic = "force-dynamic";

interface UnauthorizedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function messageFor(reason: string | undefined): { title: string; body: string } {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "Account not provisioned",
        body: "Your identity provider login succeeded, but no ClientShield user is linked to this identity. Ask an ADMIN or OWNER to create your user and link your external ID.",
      };
    case "disabled":
      return {
        title: "Account disabled",
        body: "This ClientShield account has been disabled. Contact an organization administrator.",
      };
    case "misconfigured":
      return {
        title: "Authentication unavailable",
        body: "This environment is missing a valid authentication configuration. Production refuses to operate until Auth0 and AUTH_SECRET are configured.",
      };
    case "forbidden":
      return {
        title: "Forbidden",
        body: "You do not have permission to perform this action.",
      };
    default:
      return {
        title: "Unauthorized",
        body: "You are not authorized to access this resource.",
      };
  }
}

export default async function UnauthorizedPage({
  searchParams,
}: UnauthorizedPageProps) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const copy = messageFor(reason);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted">{copy.body}</p>
        <div className="flex justify-center gap-4 pt-2 text-sm">
          <Link href="/login" className="text-accent">
            Sign in
          </Link>
          <Link href="/" className="text-muted hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
