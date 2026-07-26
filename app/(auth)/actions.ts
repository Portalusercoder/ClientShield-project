"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import {
  isAuthDevBypassEnabled,
  sanitizeReturnTo,
} from "@/lib/auth/auth-config";
import {
  clearDevBypassSignedOut,
  markDevBypassSignedOut,
} from "@/lib/auth/dev-bypass-logout";

/**
 * Ends the ClientShield session.
 *
 * - Auth0: Auth.js signOut clears JWT session cookies and redirects to /login.
 * - Dev bypass: no Auth.js cookie exists — set a signed-out marker so getSession
 *   and middleware stop reconstituting the bypass user until Continue.
 */
export async function logoutAction() {
  if (isAuthDevBypassEnabled()) {
    await markDevBypassSignedOut();
    redirect("/login");
  }

  // Clear any leftover bypass marker if env flipped between modes.
  try {
    await clearDevBypassSignedOut();
  } catch {
    /* ignore */
  }

  await signOut({ redirectTo: "/login" });
}

/** Re-enter the app under AUTH_DEV_BYPASS after a local sign-out. */
export async function continueDevBypassAction(formData: FormData) {
  if (!isAuthDevBypassEnabled()) {
    redirect("/login");
  }
  const raw = formData.get("returnTo");
  const returnTo = sanitizeReturnTo(
    typeof raw === "string" ? raw : "/"
  );
  await clearDevBypassSignedOut();
  redirect(returnTo);
}
