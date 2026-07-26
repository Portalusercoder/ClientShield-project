import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
          ],
  });

  // Slow-query hook — dynamic import keeps observability out of Edge/client graphs.
  client.$on("query", (e: Prisma.QueryEvent) => {
    void import("@/lib/observability/timing")
      .then(({ maybeLogSlowQuery }) => {
        maybeLogSlowQuery({
          durationMs: e.duration,
          operation: e.query.slice(0, 80),
        });
      })
      .catch(() => {});
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
