/**
 * Startup validation (Phase 6P1 + 6P2 observability).
 * Fail closed in production when mandatory config or database is unavailable.
 */
import { assertProductionAuthConfigured } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/db";
import {
  getDiagnosticsSnapshot,
  getLoadedConfigSummary,
  logger,
  runWithObservabilityContext,
  startTimer,
} from "@/lib/observability";

/**
 * Validate production-mandatory environment beyond Zod defaults.
 * Called after `lib/env` has already parsed known keys.
 */
export function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;

  assertProductionAuthConfigured();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is required in production (public base URL behind nginx)."
    );
  }
  try {
    new URL(appUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL");
  }

  if (process.env.AUTH_DEV_BYPASS === "true") {
    throw new Error(
      "AUTH_DEV_BYPASS=true is refused when NODE_ENV=production"
    );
  }

  const db = process.env.DATABASE_URL?.trim();
  if (!db) {
    throw new Error("DATABASE_URL is required");
  }
  if (/localhost|127\.0\.0\.1/i.test(db) && process.env.ALLOW_LOCALHOST_DB !== "true") {
    logger.info(
      "DATABASE_URL points at localhost — set ALLOW_LOCALHOST_DB=true only for local docker-compose production tests",
      { service: "startup", action: "assertProductionEnvironment" }
    );
  }
}

export async function assertDatabaseReady(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Database is not ready — refusing to start. (${detail.slice(0, 200)})`
    );
  }
}

/**
 * Full Node.js startup gate. Throws → process should exit.
 */
export async function runStartupValidation(): Promise<void> {
  return runWithObservabilityContext(
    { service: "startup", action: "runStartupValidation" },
    async () => {
      const timer = startTimer();
      logger.info("startup.validation.start", {
        action: "runStartupValidation",
        nodeEnv: process.env.NODE_ENV,
        buildVersion: process.env.BUILD_VERSION ?? null,
      });

      await import("@/lib/env");

      assertProductionEnvironment();
      await assertDatabaseReady();

      const diagnostics = getDiagnosticsSnapshot();
      logger.info("startup.validation.passed", {
        action: "runStartupValidation",
        durationMs: timer.elapsedMs(),
        version: diagnostics.version,
        gitSha: diagnostics.gitSha,
        config: getLoadedConfigSummary(),
      });
    }
  );
}
