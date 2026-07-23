"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { isAuthDevBypassEnabled } from "@/lib/auth/auth-config";

export async function logoutAction() {
  if (isAuthDevBypassEnabled()) {
    redirect("/login");
  }
  await signOut({ redirectTo: "/login" });
}
