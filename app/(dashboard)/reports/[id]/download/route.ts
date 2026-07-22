import { NextResponse } from "next/server";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import { getReportPdfBuffer } from "@/services/reports/report.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Authenticated PDF download — resolves storage server-side by report ID.
 * Never accepts filesystem paths from the client.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "VIEWER");

    const { id } = await context.params;
    const { buffer, fileName } = await getReportPdfBuffer({
      organizationId: session.organizationId,
      actorId: session.userId,
      reportId: id,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Download failed";
    const status =
      message === "Unauthorized" || message === "Forbidden"
        ? 403
        : message.includes("not found")
          ? 404
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
