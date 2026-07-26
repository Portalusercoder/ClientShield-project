/**
 * Server Action security guard (Phase 6P3).
 * Call after requireSession for user/org-aware rate limits.
 */
import { headers } from "next/headers";
import type { AuthSession } from "@/lib/auth/types";
import { extractClientIp } from "@/lib/security/client-ip";
import { assertRateLimit } from "@/lib/security/enforce-rate-limit";
import type { RateLimitBucket } from "@/lib/security/rate-limit";

export async function guardAuthenticatedAction(
  session: AuthSession,
  actionName: string,
  opts?: { bucket?: RateLimitBucket }
): Promise<void> {
  const h = await headers();
  assertRateLimit({
    bucket: opts?.bucket ?? "action",
    ip: extractClientIp(h),
    userId: session.userId,
    organizationId: session.organizationId,
    action: actionName,
  });
}
