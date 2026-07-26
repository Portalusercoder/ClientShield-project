import { NextResponse } from "next/server";
import { requireSession, hasMinimumRole } from "@/lib/auth";
import {
  getRequestId,
  toSafeError,
  withApiRoute,
} from "@/lib/observability";
import { frameworkReportRequestSchema } from "@/lib/validations/reporting";
import { previewFrameworkReport } from "@/services/reporting/reporting.service";

/**
 * POST /api/reporting/preview
 * Returns FrameworkReportDocument JSON for on-demand preview.
 */
export async function POST(request: Request) {
  try {
    return await withApiRoute("reporting.preview", async () => {
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

      const report = await previewFrameworkReport({
        organizationId: session.organizationId,
        kind: parsed.data.kind,
        filters: parsed.data.filters,
      });

      const requestId = getRequestId();
      return NextResponse.json(
        {
          success: true,
          data: report,
          meta: { requestId },
        },
        {
          headers: requestId ? { "x-request-id": requestId } : undefined,
        }
      );
    });
  } catch (error) {
    const safe = toSafeError(error, {
      requestId: getRequestId(),
      action: "reporting.preview",
    });
    return NextResponse.json(safe.client, { status: safe.httpStatus });
  }
}
