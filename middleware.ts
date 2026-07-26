import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAuthDevBypassEnabled,
  resolveAuthRuntimeMode,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";

/**
 * Edge middleware: security headers + lightweight auth gate + request IDs.
 *
 * Authoritative authorization (org/role/disabled) remains in requireSession (Node).
 * Middleware only checks session presence (or explicit AUTH_DEV_BYPASS in development).
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

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  const { pathname } = request.nextUrl;

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
      redirect.headers.set(REQUEST_ID_HEADER, requestId);
      redirect.headers.set(CORRELATION_ID_HEADER, correlationId);
      return redirect;
    }
  }

  const sessionCookie =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "returnTo",
      sanitizeReturnTo(`${pathname}${request.nextUrl.search}`)
    );
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    redirect.headers.set(CORRELATION_ID_HEADER, correlationId);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
