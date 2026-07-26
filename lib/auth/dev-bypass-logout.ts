/**
 * Dev-bypass logout flag.
 *
 * AUTH_DEV_BYPASS has no Auth.js session cookie. Without a local "signed out"
 * marker, getSession() always reconstitutes the bypass user and Sign out is a
 * no-op (login immediately redirects back into the app).
 *
 * Cookie is httpOnly and shared across tabs; cleared on explicit re-entry.
 */
import { cookies } from "next/headers";

export const DEV_BYPASS_SIGNED_OUT_COOKIE = "cs-dev-bypass-signed-out";

export function isDevBypassSignedOutCookieValue(
  value: string | undefined | null
): boolean {
  return value === "1";
}

/** Edge/middleware: read from request cookie bag. */
export function hasDevBypassSignedOutCookie(
  getCookie: (name: string) => { value: string } | undefined
): boolean {
  return isDevBypassSignedOutCookieValue(
    getCookie(DEV_BYPASS_SIGNED_OUT_COOKIE)?.value
  );
}

/**
 * Server Components / actions: true when bypass user has signed out.
 * Outside a request context (scripts/tests), returns false.
 */
export async function isDevBypassSignedOut(): Promise<boolean> {
  try {
    const jar = await cookies();
    return isDevBypassSignedOutCookieValue(
      jar.get(DEV_BYPASS_SIGNED_OUT_COOKIE)?.value
    );
  } catch {
    return false;
  }
}

export async function markDevBypassSignedOut(): Promise<void> {
  const jar = await cookies();
  jar.set(DEV_BYPASS_SIGNED_OUT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // Persist until explicit sign-in; not a session cookie so refresh stays logged out.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearDevBypassSignedOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_BYPASS_SIGNED_OUT_COOKIE);
}
