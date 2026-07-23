import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAuthDevBypassEnabled,
  resolveAuthRuntimeMode,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";

/**
 * Edge middleware: security headers + lightweight auth gate.
 *
 * Authoritative authorization (org/role/disabled) remains in requireSession (Node).
 * Middleware only checks session presence (or explicit AUTH_DEV_BYPASS in development).
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/unauthorized",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/brand",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return response;
  }

  // Local-only bypass — never in production.
  if (isAuthDevBypassEnabled()) {
    return response;
  }

  const mode = resolveAuthRuntimeMode();
  if (mode === "misconfigured") {
    if (process.env.NODE_ENV === "production") {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.searchParams.set("reason", "misconfigured");
      return NextResponse.redirect(url);
    }
    // Non-production without bypass or Auth0: treat as unauthenticated.
  }

  // Lightweight cookie presence check for Auth.js session token.
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
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
