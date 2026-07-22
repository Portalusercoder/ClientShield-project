/**
 * Generate one Security Posture Report for visual QA (no scans).
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID, DEV_USER_ID } from "../lib/dev-constants";
import { generateSecurityPostureReport } from "../services/reports/report.service";
import { getReportStorageRoot } from "../services/reports/report-storage.service";
import path from "node:path";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findFirst({
    where: {
      organizationId: DEV_ORG_ID,
      OR: [
        { slug: "saddle-up" },
        { name: { contains: "Saddle", mode: "insensitive" } },
      ],
    },
  });
  if (!client) throw new Error("SaddleUp client not found");

  const result = await generateSecurityPostureReport({
    organizationId: DEV_ORG_ID,
    actorId: DEV_USER_ID,
    clientId: client.id,
    title: "Security Posture Report — Saddle up (Visual QA Redesign)",
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-12-31T23:59:59.999Z"),
  });

  const report = await prisma.report.findUnique({ where: { id: result.id } });
  if (!report?.storageKey || !report.fileName) {
    throw new Error("Report missing storage metadata");
  }

  const fullPath = path.join(getReportStorageRoot(), report.storageKey);
  console.log(
    JSON.stringify(
      {
        reportId: report.id,
        version: report.version,
        status: report.status,
        fileName: report.fileName,
        storageKey: report.storageKey,
        absolutePath: fullPath,
        previewUrl: `http://localhost:3001/reports/${report.id}`,
        downloadUrl: `http://localhost:3001/reports/${report.id}/download`,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
