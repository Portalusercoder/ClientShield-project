/**
 * Targeted cleanup for a known bad development due date.
 * Dry-run by default. Does not bulk-modify unrelated findings.
 *
 *   npx tsx scripts/fix-dev-past-due-date.ts --id=<findingId>
 *   npx tsx scripts/fix-dev-past-due-date.ts --id=<findingId> --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const idArg = process.argv.find((a) => a.startsWith("--id="));
const findingId = idArg?.slice(5);

async function main() {
  if (!findingId) {
    console.error("Required: --id=<findingId>");
    process.exit(1);
  }

  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    select: { id: true, title: true, dueDate: true, status: true },
  });
  if (!finding) {
    console.error("Finding not found");
    process.exit(1);
  }

  console.log(
    `MODE: ${APPLY ? "APPLY" : "DRY-RUN"} — finding ${finding.id} due=${finding.dueDate?.toISOString() ?? "null"} status=${finding.status}`
  );

  if (!APPLY) {
    console.log("Re-run with --apply to set dueDate to null.");
    return;
  }

  await prisma.finding.update({
    where: { id: finding.id },
    data: { dueDate: null },
  });
  console.log("Cleared dueDate.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
