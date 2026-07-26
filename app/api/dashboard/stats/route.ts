import { NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/auth";
import {
  getRequestId,
  toSafeError,
  withApiRoute,
} from "@/lib/observability";
import { getDashboardData } from "@/services/dashboard.service";

/**
 * GET /api/dashboard/stats
 *
 * Returns dashboard metrics for the authenticated organization.
 */
export async function GET() {
  try {
    return await withApiRoute("dashboard.stats", async () => {
      const organizationId = await getOrganizationId();
      const data = await getDashboardData(organizationId);
      const requestId = getRequestId();

      return NextResponse.json(
        {
          success: true,
          data,
          meta: {
            source: "mock",
            message: "Dashboard data is mock data for MVP development",
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
    return NextResponse.json(safe.client, {
      status: safe.httpStatus,
      headers: safe.client.requestId
        ? { "x-request-id": safe.client.requestId }
        : undefined,
    });
  }
}
