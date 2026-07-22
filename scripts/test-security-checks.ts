/**
 * Automated tests for passive security checks (SSRF, scoring, headers, cookies, findings).
 * Uses local fixtures/mocks only — does not contact third-party production websites.
 *
 * Run: npx tsx scripts/test-security-checks.ts
 */
import assert from "node:assert/strict";
import { checkCookieSecurity } from "../services/security-checks/cookie-check.service";
import { buildPassiveFindings } from "../services/security-checks/findings.service";
import { checkSecurityHeaders } from "../services/security-checks/headers-check.service";
import {
  assertSafeUrl,
  isBlockedHostname,
  isBlockedIpAddress,
} from "../services/security-checks/network-safety.service";
import { calculateSecurityScore } from "../services/security-checks/scoring.service";
import type { SecurityCheckSummary } from "../types/security-check";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL  ${name}`);
      console.error(error);
    }
  })();
}

async function main() {
  console.log("Running security-check tests...\n");

  await test("blocks localhost hostname", () => {
    assert.equal(isBlockedHostname("localhost"), true);
    assert.equal(isBlockedHostname("foo.localhost"), true);
  });

  await test("blocks loopback and private IPv4", () => {
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.5"), true);
    assert.equal(isBlockedIpAddress("192.168.1.10"), true);
    assert.equal(isBlockedIpAddress("172.16.0.1"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  });

  await test("blocks IPv6 loopback and link-local", () => {
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("fe80::1"), true);
    assert.equal(isBlockedIpAddress("fc00::1"), true);
  });

  await test("rejects embedded URL credentials", async () => {
    await assert.rejects(
      () => assertSafeUrl("https://user:pass@example.com"),
      /credentials/i
    );
  });

  await test("rejects non-http protocols", async () => {
    await assert.rejects(
      () => assertSafeUrl("ftp://example.com"),
      /protocol/i
    );
  });

  await test("rejects localhost URL", async () => {
    await assert.rejects(
      () => assertSafeUrl("http://localhost/admin"),
      /not allowed/i
    );
  });

  await test("rejects 127.0.0.1 URL", async () => {
    await assert.rejects(
      () => assertSafeUrl("http://127.0.0.1/"),
      /not allowed/i
    );
  });

  await test("rejects private IPv4 URL", async () => {
    await assert.rejects(
      () => assertSafeUrl("http://10.1.2.3/"),
      /not allowed/i
    );
  });

  await test("rejects cloud metadata IP", async () => {
    await assert.rejects(
      () => assertSafeUrl("http://169.254.169.254/latest/meta-data"),
      /not allowed/i
    );
  });

  await test("rejects malformed hostname URL", async () => {
    await assert.rejects(() => assertSafeUrl("https:///path"), /Invalid URL|not allowed|Unable/i);
  });

  await test("parses security headers", () => {
    const result = checkSecurityHeaders({
      "strict-transport-security": "max-age=31536000",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "permissions-policy": "camera=()",
    });
    assert.equal(result.missingCount, 0);
    assert.equal(result.presentCount, 6);
  });

  await test("detects missing clickjacking protection", () => {
    const result = checkSecurityHeaders({});
    const clickjacking = result.items.find(
      (i) => i.name === "Clickjacking-Protection"
    );
    assert.equal(clickjacking?.status, "MISSING");
  });

  await test("parses cookies without exposing values", () => {
    const result = checkCookieSecurity({
      "set-cookie": [
        "session=SUPERSECRET; Secure; HttpOnly; SameSite=Lax",
        "prefs=1; Path=/",
      ],
    });
    assert.equal(result.cookiesObserved, 2);
    assert.equal(result.allSecure, false);
    assert.equal(result.allHttpOnly, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("SUPERSECRET"), false);
    assert.equal(serialized.includes("session="), false);
  });

  await test("score calculation awards full cookie points when none set", () => {
    const { score, breakdown } = calculateSecurityScore({
      https: {
        reachable: true,
        statusCode: 200,
        finalUrl: "https://example.com",
        responseTimeMs: 100,
        httpRedirectsToHttps: true,
        error: null,
      },
      tls: {
        status: "VALID",
        subject: "CN=example.com",
        issuer: "CN=Test",
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 90 * 86400000).toISOString(),
        daysUntilExpiration: 90,
        currentlyValid: true,
        hostnameValid: true,
        error: null,
      },
      headers: checkSecurityHeaders({
        "strict-transport-security": "max-age=1",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
      }),
      cookies: checkCookieSecurity({}),
    });
    assert.equal(breakdown.cookieSecurity, 10);
    assert.equal(score, 100);
  });

  await test("finding builder creates expected codes", () => {
    const summary: SecurityCheckSummary = {
      https: {
        reachable: false,
        statusCode: null,
        finalUrl: null,
        responseTimeMs: null,
        httpRedirectsToHttps: null,
        error: "timeout",
      },
      tls: {
        status: "EXPIRED",
        subject: null,
        issuer: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiration: -5,
        currentlyValid: false,
        hostnameValid: false,
        error: null,
      },
      headers: checkSecurityHeaders({}),
      cookies: checkCookieSecurity({
        "set-cookie": ["a=b; Path=/"],
      }),
      scoreBreakdown: {},
      posture: {
        https: "Critical",
        tls: "Critical",
        headers: "Critical",
        cookies: "Critical",
      },
    };

    const findings = buildPassiveFindings(summary);
    const codes = findings.map((f) => f.code);
    assert.ok(codes.includes("HTTPS_UNAVAILABLE"));
    assert.ok(codes.includes("TLS_EXPIRED"));
    assert.ok(codes.includes("HSTS_MISSING"));
    assert.ok(codes.includes("COOKIE_SECURE_MISSING"));
  });

  await test("finding deduplication codes are unique per check", () => {
    const summary: SecurityCheckSummary = {
      https: {
        reachable: true,
        statusCode: 200,
        finalUrl: "https://example.com",
        responseTimeMs: 50,
        httpRedirectsToHttps: true,
        error: null,
      },
      tls: {
        status: "VALID",
        subject: "CN=example.com",
        issuer: "CN=Test",
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 120 * 86400000).toISOString(),
        daysUntilExpiration: 120,
        currentlyValid: true,
        hostnameValid: true,
        error: null,
      },
      headers: checkSecurityHeaders({}),
      cookies: checkCookieSecurity({}),
      scoreBreakdown: {},
      posture: {
        https: "Good",
        tls: "Good",
        headers: "Critical",
        cookies: "Not Applicable",
      },
    };
    const findings = buildPassiveFindings(summary);
    const codes = findings.map((f) => f.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
