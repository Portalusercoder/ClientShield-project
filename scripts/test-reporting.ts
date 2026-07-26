/**
 * Phase 6C3 — on-demand reporting framework tests.
 */
import { PrismaClient } from "@prisma/client";
import { DEV_ORG_ID } from "../lib/dev-constants";
import { rowsToCsv, escapeCsvField, reportTablesToCsv } from "../services/reporting/shared/csv";
import { isFrameworkReportKind, buildFrameworkReport, exportFrameworkReportPdf, exportFrameworkReportCsv } from "../services/reporting/reporting.service";
import { FRAMEWORK_REPORT_KINDS } from "../services/reporting/reporting.service";
import { frameworkReportRequestSchema } from "../lib/validations/reporting";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    passed += 1;
  } else {
    console.log(`  FAIL: ${msg}`);
    failed += 1;
  }
}

async function main() {
  console.log("Reporting framework tests (Phase 6C3)\n");

  assert(isFrameworkReportKind("EXECUTIVE_SUMMARY"), "kind EXECUTIVE_SUMMARY valid");
  assert(isFrameworkReportKind("SLA"), "kind SLA valid");
  assert(!isFrameworkReportKind("SECURITY_POSTURE"), "SECURITY_POSTURE is not framework kind");
  assert(FRAMEWORK_REPORT_KINDS.length === 7, "seven framework kinds");

  const bad = frameworkReportRequestSchema.safeParse({ kind: "NOPE" });
  assert(!bad.success, "invalid kind rejected");

  const good = frameworkReportRequestSchema.safeParse({
    kind: "FINDINGS",
    filters: { severity: "HIGH" },
  });
  assert(good.success, "valid request accepted");

  assert(escapeCsvField('a,b') === '"a,b"', "CSV escapes commas");
  assert(escapeCsvField('say "hi"') === '"say ""hi"""', "CSV escapes quotes");

  const csv = rowsToCsv(
    [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
    [{ a: "1", b: "two,three" }]
  );
  assert(csv.includes("A,B"), "CSV header");
  assert(csv.includes('"two,three"'), "CSV row escaped");

  const org = await prisma.organization.findFirst({
    where: { id: DEV_ORG_ID },
    select: { id: true },
  });
  assert(Boolean(org), "dev org present");

  if (org) {
    for (const kind of FRAMEWORK_REPORT_KINDS) {
      const doc = await buildFrameworkReport({
        organizationId: org.id,
        kind,
        filters: {},
      });
      assert(doc.kind === kind, `${kind}: document kind`);
      assert(doc.organizationId === org.id, `${kind}: org id`);
      assert(Boolean(doc.title), `${kind}: title`);
      assert(Boolean(doc.generatedAt), `${kind}: generatedAt`);
      assert(Array.isArray(doc.sections), `${kind}: sections array`);
      assert(typeof doc.summary === "string", `${kind}: summary`);
    }

    const pdf = await exportFrameworkReportPdf({
      organizationId: org.id,
      kind: "EXECUTIVE_SUMMARY",
    });
    assert(pdf.buffer.length > 500, "PDF buffer non-trivial");
    assert(pdf.filename.endsWith(".pdf"), "PDF filename");
    assert(pdf.buffer.subarray(0, 4).toString() === "%PDF", "PDF magic");

    const csvExport = await exportFrameworkReportCsv({
      organizationId: org.id,
      kind: "INCIDENT",
    });
    assert(csvExport.csv.includes("\n"), "CSV has rows/newlines");
    assert(csvExport.filename.endsWith(".csv"), "CSV filename");

    const multi = reportTablesToCsv([
      {
        id: "t1",
        title: "One",
        columns: [{ key: "x", label: "X" }],
        rows: [{ x: 1 }],
      },
      {
        id: "t2",
        title: "Two",
        columns: [{ key: "y", label: "Y" }],
        rows: [{ y: 2 }],
      },
    ]);
    assert(multi.includes("# One") || multi.includes("X"), "multi-table CSV");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
