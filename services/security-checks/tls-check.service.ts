import tls from "node:tls";
import type { TlsCheckResult, TlsStatus } from "@/types/security-check";
import {
  NETWORK_SAFETY,
  assertSafeUrl,
} from "@/services/security-checks/network-safety.service";

const EXPIRING_SOON_DAYS = 30;

function getCertField(
  value: string | string[] | tls.PeerCertificate["subject"] | undefined
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return value.CN
    ? Array.isArray(value.CN)
      ? value.CN.join(", ")
      : value.CN
    : value.O
      ? Array.isArray(value.O)
        ? value.O.join(", ")
        : value.O
      : JSON.stringify(value);
}

/**
 * Inspects the TLS certificate for an HTTPS endpoint.
 * TLS validation remains enabled (rejectUnauthorized: true).
 */
export async function checkTlsCertificate(
  assetUrl: string
): Promise<TlsCheckResult> {
  try {
    const parsed = await assertSafeUrl(assetUrl);
    if (parsed.protocol !== "https:") {
      const httpsUrl = `https://${parsed.host}${parsed.pathname}${parsed.search}`;
      return checkTlsCertificate(httpsUrl);
    }

    const host = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : 443;

    const cert = await new Promise<tls.PeerCertificate>((resolve, reject) => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          rejectUnauthorized: true,
          timeout: NETWORK_SAFETY.REQUEST_TIMEOUT_MS,
        },
        () => {
          const peer = socket.getPeerCertificate();
          socket.end();
          if (!peer || Object.keys(peer).length === 0) {
            reject(new Error("No TLS certificate presented"));
            return;
          }
          resolve(peer);
        }
      );

      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("TLS connection timed out"));
      });
    });

    const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
    const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
    const now = new Date();

    let daysUntilExpiration: number | null = null;
    if (validTo) {
      daysUntilExpiration = Math.floor(
        (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    const currentlyValid =
      Boolean(validFrom && validTo) &&
      now >= (validFrom as Date) &&
      now <= (validTo as Date);

    let status: TlsStatus = "VALID";
    if (!currentlyValid && daysUntilExpiration !== null && daysUntilExpiration < 0) {
      status = "EXPIRED";
    } else if (!currentlyValid) {
      status = "INVALID";
    } else if (
      daysUntilExpiration !== null &&
      daysUntilExpiration <= EXPIRING_SOON_DAYS
    ) {
      status = "EXPIRING_SOON";
    }

    // If Node accepted the handshake with rejectUnauthorized, hostname matched.
    const hostnameValid = true;

    return {
      status,
      subject: getCertField(cert.subject),
      issuer: getCertField(cert.issuer),
      validFrom: validFrom?.toISOString() ?? null,
      validTo: validTo?.toISOString() ?? null,
      daysUntilExpiration,
      currentlyValid,
      hostnameValid,
      error: null,
    };
  } catch (error) {
    return {
      status: "INVALID",
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      daysUntilExpiration: null,
      currentlyValid: false,
      hostnameValid: false,
      error: error instanceof Error ? error.message : "TLS check failed",
    };
  }
}
