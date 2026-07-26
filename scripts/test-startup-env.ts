/**
 * Phase 6P1 — environment / startup validation unit checks.
 * Run: npm run test:startup-env
 *
 * Does not require a live database when testing the production auth gate only.
 */
import {
  assertProductionAuthConfigured,
  resolveAuthRuntimeMode,
} from "../lib/auth/auth-config";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void
) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prev[key] = process.env[key];
    const v = overrides[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

function main() {
  withEnv(
    {
      NODE_ENV: "production",
      AUTH_DEV_BYPASS: "true",
      AUTH_SECRET: "x",
      AUTH_PROVIDER: "auth0",
      AUTH0_CLIENT_ID: "id",
      AUTH0_CLIENT_SECRET: "secret",
      AUTH0_ISSUER: "https://example.auth0.com",
    },
    () => {
      let threw = false;
      try {
        assertProductionAuthConfigured();
      } catch {
        threw = true;
      }
      assert(threw, "AUTH_DEV_BYPASS must be refused in production");
    }
  );

  withEnv(
    {
      NODE_ENV: "production",
      AUTH_DEV_BYPASS: undefined,
      AUTH_SECRET: undefined,
      AUTH_PROVIDER: "auth0",
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
      AUTH0_ISSUER: undefined,
    },
    () => {
      assert(resolveAuthRuntimeMode() === "misconfigured", "missing Auth0 → misconfigured");
      let threw = false;
      try {
        assertProductionAuthConfigured();
      } catch {
        threw = true;
      }
      assert(threw, "production must fail closed without Auth0");
    }
  );

  withEnv(
    {
      NODE_ENV: "production",
      AUTH_DEV_BYPASS: "false",
      AUTH_SECRET: "super-secret-value-at-least-32-chars!!",
      AUTH_PROVIDER: "auth0",
      AUTH0_CLIENT_ID: "client",
      AUTH0_CLIENT_SECRET: "secret",
      AUTH0_ISSUER: "https://tenant.auth0.com",
    },
    () => {
      assert(resolveAuthRuntimeMode() === "auth0", "full Auth0 config → auth0");
      assertProductionAuthConfigured();
    }
  );

  console.log("OK startup/env validation checks");
}

main();
