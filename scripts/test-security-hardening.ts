/**
 * Phase 6P3 — security hardening tests.
 * Run: npm run test:security
 */
import {
  DESTRUCTIVE_CONFIRM,
  assertDestructiveConfirmation,
  buildContentSecurityPolicy,
  buildRateLimitKey,
  checkRateLimit,
  entityIdSchema,
  getCspHeaderName,
  getSecurityConfig,
  refuseOrganizationHardDelete,
  resetRateLimitStore,
  resetSecurityConfigCache,
  safeFilenameSchema,
  safeHttpUrlSchema,
} from "../lib/security";
import { applySecurityHeaders } from "../lib/security/headers";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function testCsp() {
  const prod = buildContentSecurityPolicy({
    isProduction: true,
    auth0Issuer: "https://tenant.auth0.com",
  });
  assert(prod.includes("default-src 'self'"), "default-src");
  assert(prod.includes("frame-ancestors 'none'"), "frame-ancestors");
  assert(prod.includes("object-src 'none'"), "object-src");
  assert(prod.includes("https://tenant.auth0.com"), "issuer origin");
  assert(prod.includes("upgrade-insecure-requests"), "upgrade");
  assert(!prod.includes("'unsafe-eval'"), "no unsafe-eval in prod");
  assert(prod.includes("style-src") && prod.includes("'unsafe-inline'"), "style exception");

  const dev = buildContentSecurityPolicy({ isProduction: false });
  assert(dev.includes("'unsafe-eval'"), "dev unsafe-eval");

  process.env.CSP_REPORT_ONLY = "true";
  resetSecurityConfigCache();
  assert(
    getCspHeaderName() === "Content-Security-Policy-Report-Only",
    "report-only header"
  );
  delete process.env.CSP_REPORT_ONLY;
  resetSecurityConfigCache();
}

function testHeaders() {
  const map = new Map<string, string>();
  applySecurityHeaders({
    set(name, value) {
      map.set(name, value);
    },
  });
  assert(map.get("X-Content-Type-Options") === "nosniff", "nosniff");
  assert(map.get("X-Frame-Options") === "DENY", "frame");
  assert(map.get("Referrer-Policy")?.includes("strict-origin"), "referrer");
  assert(map.has("Permissions-Policy"), "permissions");
  // COOP/CORP only in production
  if (process.env.NODE_ENV === "production") {
    assert(map.get("Cross-Origin-Opener-Policy") === "same-origin", "coop");
    assert(map.get("Cross-Origin-Resource-Policy") === "same-origin", "corp");
  }
}

function testRateLimit() {
  resetRateLimitStore();
  const key = buildRateLimitKey({
    bucket: "auth",
    ip: "1.2.3.4",
    action: "login",
  });
  for (let i = 0; i < 5; i++) {
    const r = checkRateLimit({ key, limit: 5, windowMs: 60_000 });
    assert(r.allowed, `allowed ${i}`);
  }
  const blocked = checkRateLimit({ key, limit: 5, windowMs: 60_000 });
  assert(!blocked.allowed, "blocked");
  assert(blocked.retryAfterSeconds >= 1, "retry-after");
}

function testDestructive() {
  assertDestructiveConfirmation({
    expected: DESTRUCTIVE_CONFIRM.CLIENT_OFFBOARD,
    provided: "OFFBOARD",
    action: "test",
  });
  let blocked = false;
  try {
    assertDestructiveConfirmation({
      expected: DESTRUCTIVE_CONFIRM.CLIENT_OFFBOARD,
      provided: "nope",
      action: "test",
    });
  } catch {
    blocked = true;
  }
  assert(blocked, "bad confirm blocked");

  let refused = false;
  try {
    refuseOrganizationHardDelete({ organizationId: "x" });
  } catch {
    refused = true;
  }
  assert(refused, "org delete refused");
}

function testValidation() {
  assert(entityIdSchema.safeParse("clxxxxxxxx").success, "id ok");
  assert(!entityIdSchema.safeParse("../etc/passwd").success, "id path");
  assert(safeFilenameSchema.safeParse("report.pdf").success, "file ok");
  assert(!safeFilenameSchema.safeParse("../x").success, "file path");
  assert(safeHttpUrlSchema.safeParse("https://example.com/a").success, "url ok");
  assert(!safeHttpUrlSchema.safeParse("javascript:alert(1)").success, "url js");
}

function testConfigDefaults() {
  resetSecurityConfigCache();
  delete process.env.ENABLE_CSP;
  delete process.env.ENABLE_RATE_LIMITING;
  resetSecurityConfigCache();
  const cfg = getSecurityConfig();
  assert(cfg.enableCsp === true, "csp default on");
  assert(cfg.enableRateLimiting === true, "rl default on");
}

async function main() {
  testConfigDefaults();
  testCsp();
  testHeaders();
  testRateLimit();
  testDestructive();
  testValidation();
  console.log("OK security hardening tests");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
