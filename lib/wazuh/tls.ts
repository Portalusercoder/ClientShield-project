import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { serverEnv } from "@/lib/env";

/**
 * Build an HTTPS agent that:
 * - trusts the configured Wazuh CA (or an explicit override path)
 * - verifies the peer certificate against an expected hostname (SAN/CN)
 * - never sets rejectUnauthorized: false
 *
 * Connecting to 127.0.0.1 with checkServerIdentity for the expected hostname
 * keeps TLS verification while using localhost-bound ports.
 */
export function createWazuhTlsAgent(
  expectedHostname: string,
  caCertPath?: string | null
): https.Agent {
  const options: https.AgentOptions = {
    rejectUnauthorized: true,
    checkServerIdentity: (_host, cert) => {
      return tls.checkServerIdentity(expectedHostname, cert);
    },
  };

  const path = caCertPath || serverEnv.WAZUH_CA_CERT_PATH;
  if (path) {
    try {
      options.ca = fs.readFileSync(path);
    } catch {
      throw new Error(
        "Unable to read Wazuh CA certificate path — check WAZUH_CA_CERT_PATH / WAZUH_MANAGER_CA_CERT_PATH"
      );
    }
  }

  return new https.Agent(options);
}
