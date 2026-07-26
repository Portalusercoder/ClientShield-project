import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getRequestId,
  toSafeError,
  withApiRoute,
} from "@/lib/observability";
import { getSocAnalystDashboard } from "@/services/dashboard/soc-dashboard.service";

/**
 * GET /api/dashboard/stats
 *
 * Returns SOC analyst dashboard metrics for the authenticated user/org.
 */
export async function GET() {
  try {
    return await withApiRoute("dashboard.stats", async () => {
      const session = await requireSession();
      const data = await getSocAnalystDashboard({
        organizationId: session.organizationId,
        userId: session.userId,
      });
      const requestId = getRequestId();

      return NextResponse.json(
        {
          success: true,
          data,
          meta: {
            source: "live",
            message: "SOC analyst dashboard aggregation",
            requestId,
          },
        },
        {
          headers: requestId ? { "x-request-id": requestId } : undefined,
        }
      );
    });
  } catch (error) {
    const safe = toSafeError(error, {
      requestId: getRequestId(),
      action: "dashboard.stats",
    });
    return NextResponse.json(safe.client, { status: safe.httpStatus });
  }
}
