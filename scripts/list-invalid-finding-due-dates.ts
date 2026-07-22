/**
 * List findings with due dates in the past (still unresolved).
 * Dry-run / report only — does not modify data.
 *
 *   npx tsx scripts/list-invalid-finding-due-dates.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const rows = await prisma.finding.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: ["OPEN", "VALIDATED", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      organizationId: true,
      assetId: true,
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  console.log(`Unresolved findings with past due dates: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `- ${r.id} | ${r.status} | due=${r.dueDate?.toISOString().slice(0, 10)} | ${r.title}`
    );
  }
  console.log(
    "\nTo clear a known bad DEV due date, run:\n  npx tsx scripts/fix-dev-past-due-date.ts --apply --id=<findingId>"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
