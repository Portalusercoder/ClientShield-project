import { NextResponse } from "next/server";
import { getOrganizationId } from "@/lib/auth";
import { getDashboardData } from "@/services/dashboard.service";

/**
 * GET /api/dashboard/stats
 *
 * Returns dashboard metrics for the authenticated organization.
 *
 * TODO: Enforce authentication middleware.
 * TODO: Add rate limiting for API routes.
 */
export async function GET() {
  try {
    const organizationId = await getOrganizationId();
    const data = await getDashboardData(organizationId);

    return NextResponse.json({
      success: true,
      data,
      meta: {
        source: "mock",
        message: "Dashboard data is mock data for MVP development",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message === "Unauthorized" ? 401 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
