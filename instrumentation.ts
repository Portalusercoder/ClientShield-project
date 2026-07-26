/**
 * Next.js instrumentation hook (Phase 6P1 + 6P2).
 * Runs once on Node server boot — fail closed if startup validation fails.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { runStartupValidation } = await import("@/lib/startup/bootstrap");
    await runStartupValidation();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      const { logger } = await import("@/lib/observability/logger");
      logger.fatal("Startup validation failed — exiting", {
        service: "instrumentation",
        action: "register",
        err: e instanceof Error ? e : new Error(message),
      });
    } catch {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "FATAL",
          service: "instrumentation",
          message: "Startup validation failed — exiting",
          error: message,
        })
      );
    }
    process.exit(1);
  }
}
