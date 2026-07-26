import { NextResponse } from "next/server";
import { getRequestId, withApiRoute } from "@/lib/observability";
import { toSafeError } from "@/lib/observability/errors";
import { getHealthCheckResult } from "@/services/health.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — public liveness/readiness probe (Phase 6P1 + 6P2).
 * Does not expose secrets or connection strings.
 */
export async function GET() {
  try {
    return await withApiRoute("health", async () => {
      const result = await getHealthCheckResult();
      const httpStatus =
        result.status === "ok" ? 200 : result.status === "degraded" ? 200 : 503;
      const requestId = getRequestId();

      return NextResponse.json(result, {
        status: httpStatus,
        headers: {
          "Cache-Control": "no-store",
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
      });
    });
  } catch (error) {
    const safe = toSafeError(error, { action: "health" });
    return NextResponse.json(safe.client, { status: safe.httpStatus });
  }
}
