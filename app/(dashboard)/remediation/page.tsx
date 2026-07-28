import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RemediationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Remediation lives under Findings posture work — preserve filters via query. */
export default async function RemediationPage({
  searchParams,
}: RemediationPageProps) {
  await requireSession();
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set("view", "remediation");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "view") {
      qs.set(key, value);
    }
  }
  redirect(`/vulnerabilities?${qs.toString()}`);
}
