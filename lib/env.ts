import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().optional(),
  AUTH_PROVIDER: z.enum(["none", "auth0", "clerk", "azure-ad"]).optional(),
  /** Base URL for the ZAP daemon API (server-side only). */
  ZAP_API_URL: z.string().url().default("http://127.0.0.1:8090"),
  /** Shared secret for ZAP API calls. Never expose to the browser. */
  ZAP_API_KEY: z.string().min(8).default("change-me-clientshield-zap-dev-key"),
  /** Traditional spider max duration in minutes (baseline-style). */
  ZAP_SPIDER_MAX_MINUTES: z.coerce.number().int().min(1).max(10).default(1),
  /** Overall baseline scan timeout in milliseconds. */
  ZAP_SCAN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(900_000)
    .default(300_000),
  /** Override Host header for ZAP API (Docker port-publish NAT). */
  ZAP_API_HOST_HEADER: z.string().optional(),

  /** Enable read-only Wazuh integration (server-side only). */
  WAZUH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  WAZUH_INDEXER_URL: z.string().url().optional(),
  WAZUH_INDEXER_USERNAME: z.string().optional(),
  WAZUH_INDEXER_PASSWORD: z.string().optional(),
  WAZUH_MANAGER_API_URL: z.string().url().optional(),
  WAZUH_MANAGER_API_USERNAME: z.string().optional(),
  WAZUH_MANAGER_API_PASSWORD: z.string().optional(),
  /** PEM CA used to verify Wazuh Indexer TLS certificates. */
  WAZUH_CA_CERT_PATH: z.string().optional(),
  /**
   * PEM CA/trust material for Wazuh Manager API TLS.
   * Manager API may use a different cert than Indexer (e.g. self-signed CN=wazuh.com).
   */
  WAZUH_MANAGER_CA_CERT_PATH: z.string().optional(),
  /** Expected certificate hostname for Indexer (SAN/CN). */
  WAZUH_INDEXER_TLS_SERVERNAME: z.string().default("wazuh.indexer"),
  /** Expected certificate hostname for Manager API (SAN/CN). */
  WAZUH_MANAGER_TLS_SERVERNAME: z.string().default("localhost"),
  /**
   * ClientShield organization that owns ingested Wazuh events
   * for the current single-Wazuh development model.
   */
  WAZUH_ORGANIZATION_ID: z.string().optional(),
  /** Correlation window in minutes (default 15). */
  WAZUH_CORRELATION_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(120)
    .default(15),
  /** Minimum Wazuh rule level required to create SecurityEvents (ledger still records lower). */
  WAZUH_MIN_EVENT_LEVEL: z.coerce.number().int().min(0).max(15).default(4),
  /** Comma-separated rule IDs; when non-empty, only these create SecurityEvents. */
  WAZUH_RULE_ALLOWLIST: z.string().optional(),
  /** Comma-separated rule IDs that never create SecurityEvents (still ledgered). */
  WAZUH_RULE_DENYLIST: z.string().optional(),
  /** SCA / CIS alerts use this longer correlation window (minutes). */
  WAZUH_SCA_CORRELATION_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .min(15)
    .max(10080)
    .default(1440),
  /** Background worker auto-sync (default off). */
  WAZUH_AUTO_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Polling interval for worker; minimum 30 seconds. */
  WAZUH_SYNC_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(60),
  /** Optional actor user id for worker audit logs. */
  WAZUH_WORKER_ACTOR_USER_ID: z.string().optional(),
  /** Worker identity for heartbeat/lock (defaults generated at runtime). */
  WAZUH_WORKER_ID: z.string().optional(),

  /** Cross-event investigation correlation (distinct from Wazuh occurrence correlation). */
  INVESTIGATION_CORRELATION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Lookback window for pairing related security events. */
  INVESTIGATION_CORRELATION_WINDOW_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24),
  /** Minimum confidence to persist a correlation candidate. */
  INVESTIGATION_MIN_CONFIDENCE: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM"),
  /** Manual threat-intel lookups (never auto-bulk). Default off. */
  THREAT_INTEL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  THREAT_INTEL_PROVIDER: z.string().optional(),
  THREAT_INTEL_CACHE_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("ClientShield"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  env: Record<string, string | undefined>
): z.infer<T> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(formatted)}`
    );
  }

  return result.data;
}

/**
 * Server-only environment variables. Never import this module in client components.
 */
export const serverEnv = parseEnv(serverEnvSchema, {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  ZAP_API_URL: process.env.ZAP_API_URL,
  ZAP_API_KEY: process.env.ZAP_API_KEY,
  ZAP_SPIDER_MAX_MINUTES: process.env.ZAP_SPIDER_MAX_MINUTES,
  ZAP_SCAN_TIMEOUT_MS: process.env.ZAP_SCAN_TIMEOUT_MS,
  ZAP_API_HOST_HEADER: process.env.ZAP_API_HOST_HEADER,
  WAZUH_ENABLED: process.env.WAZUH_ENABLED,
  WAZUH_INDEXER_URL: process.env.WAZUH_INDEXER_URL,
  WAZUH_INDEXER_USERNAME: process.env.WAZUH_INDEXER_USERNAME,
  WAZUH_INDEXER_PASSWORD: process.env.WAZUH_INDEXER_PASSWORD,
  WAZUH_MANAGER_API_URL: process.env.WAZUH_MANAGER_API_URL,
  WAZUH_MANAGER_API_USERNAME: process.env.WAZUH_MANAGER_API_USERNAME,
  WAZUH_MANAGER_API_PASSWORD: process.env.WAZUH_MANAGER_API_PASSWORD,
  WAZUH_CA_CERT_PATH: process.env.WAZUH_CA_CERT_PATH,
  WAZUH_MANAGER_CA_CERT_PATH: process.env.WAZUH_MANAGER_CA_CERT_PATH,
  WAZUH_INDEXER_TLS_SERVERNAME: process.env.WAZUH_INDEXER_TLS_SERVERNAME,
  WAZUH_MANAGER_TLS_SERVERNAME: process.env.WAZUH_MANAGER_TLS_SERVERNAME,
  WAZUH_ORGANIZATION_ID: process.env.WAZUH_ORGANIZATION_ID,
  WAZUH_CORRELATION_WINDOW_MINUTES:
    process.env.WAZUH_CORRELATION_WINDOW_MINUTES,
  WAZUH_MIN_EVENT_LEVEL: process.env.WAZUH_MIN_EVENT_LEVEL,
  WAZUH_RULE_ALLOWLIST: process.env.WAZUH_RULE_ALLOWLIST,
  WAZUH_RULE_DENYLIST: process.env.WAZUH_RULE_DENYLIST,
  WAZUH_SCA_CORRELATION_WINDOW_MINUTES:
    process.env.WAZUH_SCA_CORRELATION_WINDOW_MINUTES,
  WAZUH_AUTO_SYNC_ENABLED: process.env.WAZUH_AUTO_SYNC_ENABLED,
  WAZUH_SYNC_INTERVAL_SECONDS: process.env.WAZUH_SYNC_INTERVAL_SECONDS,
  WAZUH_WORKER_ACTOR_USER_ID: process.env.WAZUH_WORKER_ACTOR_USER_ID,
  WAZUH_WORKER_ID: process.env.WAZUH_WORKER_ID,
  INVESTIGATION_CORRELATION_ENABLED:
    process.env.INVESTIGATION_CORRELATION_ENABLED,
  INVESTIGATION_CORRELATION_WINDOW_HOURS:
    process.env.INVESTIGATION_CORRELATION_WINDOW_HOURS,
  INVESTIGATION_MIN_CONFIDENCE: process.env.INVESTIGATION_MIN_CONFIDENCE,
  THREAT_INTEL_ENABLED: process.env.THREAT_INTEL_ENABLED,
  THREAT_INTEL_PROVIDER: process.env.THREAT_INTEL_PROVIDER,
  THREAT_INTEL_CACHE_HOURS: process.env.THREAT_INTEL_CACHE_HOURS,
});

/**
 * Public environment variables safe to expose to the browser.
 */
export const clientEnv = parseEnv(clientEnvSchema, {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
