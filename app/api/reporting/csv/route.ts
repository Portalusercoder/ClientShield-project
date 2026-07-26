import { NextResponse } from "next/server";
import { requireSession, hasMinimumRole } from "@/lib/auth";
import {
  getRequestId,
  toSafeError,
  withApiRoute,
} from "@/lib/observability";
import { frameworkReportRequestSchema } from "@/lib/validations/reporting";
import { exportFrameworkReportCsv } from "@/services/reporting/reporting.service";

/**
 * POST /api/reporting/csv
 * Returns text/csv for an on-demand framework report.
 */
export async function POST(request: Request) {
  try {
    return await withApiRoute("reporting.csv", async () => {
      const session = await requireSession();
      if (!hasMinimumRole(session, "VIEWER")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 }
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = frameworkReportRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          },
          { status: 400 }
        );
      }

      const { csv, filename } = await exportFrameworkReportCsv({
        organizationId: session.organizationId,
        kind: parsed.data.kind,
        filters: parsed.data.filters,
      });

      const requestId = getRequestId();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
      });
    });
  } catch (error) {
    const safe = toSafeError(error, {
      requestId: getRequestId(),
      action: "reporting.csv",
    });
    return NextResponse.json(safe.client, { status: safe.httpStatus });
  }
}
