import { NextResponse } from "next/server";
import { requireSession, hasMinimumRole } from "@/lib/auth";
import {
  getRequestId,
  toSafeError,
  withApiRoute,
} from "@/lib/observability";
import { frameworkReportRequestSchema } from "@/lib/validations/reporting";
import { exportFrameworkReportPdf } from "@/services/reporting/reporting.service";

/**
 * POST /api/reporting/pdf
 * Returns application/pdf for an on-demand framework report.
 */
export async function POST(request: Request) {
  try {
    return await withApiRoute("reporting.pdf", async () => {
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

      const { buffer, filename } = await exportFrameworkReportPdf({
        organizationId: session.organizationId,
        kind: parsed.data.kind,
        filters: parsed.data.filters,
      });

      const requestId = getRequestId();
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
      });
    });
  } catch (error) {
    const safe = toSafeError(error, {
      requestId: getRequestId(),
      action: "reporting.pdf",
    });
    return NextResponse.json(safe.client, { status: safe.httpStatus });
  }
}
