import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAuthDevBypassEnabled,
  resolveAuthRuntimeMode,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";
import { applySecurityHeaders } from "@/lib/security/headers";
import { extractClientIp } from "@/lib/security/client-ip";
import { getSecurityConfig } from "@/lib/security/config";
import {
  buildRateLimitKey,
  checkRateLimit,
} from "@/lib/security/rate-limit";
import { classifyPathBucket } from "@/lib/security/enforce-rate-limit";
import { logSecurityEventEdge } from "@/lib/security/security-log";

/**
 * Edge middleware: security headers, rate limits, request IDs, lightweight auth gate.
 * Authoritative authorization remains in requireSession (Node).
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/unauthorized",
  "/api/auth",
  "/api/health",
  "/_next",
  "/favicon.ico",
  "/brand",
];

const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_ID_HEADER = "x-correlation-id";

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function newId(): string {
  return crypto.randomUUID();
}

function applyCommonHeaders(
  response: NextResponse,
  requestId: string,
  correlationId: string
): void {
  applySecurityHeaders(response.headers);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
}

export async function middleware(request: NextRequest) {
  const incomingRequestId = request.headers.get(REQUEST_ID_HEADER)?.trim();
  const incomingCorrelationId = request.headers
    .get(CORRELATION_ID_HEADER)
    ?.trim();
  const requestId = incomingRequestId || newId();
  const correlationId = incomingCorrelationId || requestId;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const { pathname } = request.nextUrl;
  const cfg = getSecurityConfig();
  const ip = extractClientIp(request.headers);

  // Lightweight edge rate limiting (IP-aware)
  if (cfg.enableRateLimiting) {
    const bucket = classifyPathBucket(pathname);
    const limits =
      bucket === "auth"
        ? { limit: cfg.rateLimitAuthMax, windowMs: cfg.rateLimitAuthWindowMs }
        : bucket === "health"
          ? {
              limit: cfg.rateLimitHealthMax,
              windowMs: cfg.rateLimitHealthWindowMs,
            }
          : { limit: cfg.rateLimitApiMax, windowMs: cfg.rateLimitApiWindowMs };

    const key = buildRateLimitKey({
      bucket,
      ip,
      action: pathname.slice(0, 120),
    });
    const result = checkRateLimit({
      key,
      limit: limits.limit,
      windowMs: limits.windowMs,
    });

    if (!result.allowed) {
      logSecurityEventEdge({
        type: "rate_limit_exceeded",
        message: "Edge rate limit exceeded",
        meta: {
          bucket,
          pathname: pathname.slice(0, 120),
          ipSuffix: ip.slice(-8),
          requestId,
        },
      });
      const denied = NextResponse.json(
        {
          success: false,
          error: "Too many requests",
          code: "RATE_LIMITED",
          requestId,
        },
        { status: 429 }
      );
      applyCommonHeaders(denied, requestId, correlationId);
      denied.headers.set(
        "Retry-After",
        String(result.retryAfterSeconds)
      );
      return denied;
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applyCommonHeaders(response, requestId, correlationId);

  if (isPublicPath(pathname)) {
    return response;
  }

  if (isAuthDevBypassEnabled()) {
    return response;
  }

  const mode = resolveAuthRuntimeMode();
  if (mode === "misconfigured") {
    if (process.env.NODE_ENV === "production") {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.searchParams.set("reason", "misconfigured");
      const redirect = NextResponse.redirect(url);
      applyCommonHeaders(redirect, requestId, correlationId);
      return redirect;
    }
  }

  const sessionCookie =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie?.value) {
    logSecurityEventEdge({
      type: "authn_failed",
      severity: "info",
      message: "Unauthenticated request redirected to login",
      meta: {
        pathname: pathname.slice(0, 120),
        requestId,
        ipSuffix: ip.slice(-8),
      },
    });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "returnTo",
      sanitizeReturnTo(`${pathname}${request.nextUrl.search}`)
    );
    const redirect = NextResponse.redirect(url);
    applyCommonHeaders(redirect, requestId, correlationId);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
