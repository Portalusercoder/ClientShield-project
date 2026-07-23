"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  createOrganizationUserSchema,
  linkExternalIdSchema,
} from "@/lib/auth/auth-config";
import {
  createOrganizationUser,
  linkUserExternalId,
  setUserDisabled,
} from "@/lib/auth/identity-mapping";

export async function createOrganizationUserAction(input: {
  email: string;
  name?: string | null;
  role: "VIEWER" | "ANALYST" | "ADMIN" | "OWNER";
}): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = createOrganizationUserSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid user input" };
    }

    // Only OWNER may create OWNER users
    if (parsed.data.role === "OWNER") {
      assertMinimumRole(session, "OWNER");
    }

    const user = await createOrganizationUser({
      organizationId: session.organizationId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
    });

    revalidatePath("/settings/users");
    return { success: true, userId: user.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create user",
    };
  }
}

export async function linkUserExternalIdAction(input: {
  userId: string;
  externalId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = linkExternalIdSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid linkage input" };
    }

    await linkUserExternalId({
      organizationId: session.organizationId,
      userId: parsed.data.userId,
      externalId: parsed.data.externalId,
    });

    revalidatePath("/settings/users");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to link identity",
    };
  }
}

export async function setUserDisabledAction(input: {
  userId: string;
  disabled: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    if (input.userId === session.userId) {
      return { success: false, error: "Cannot disable your own account" };
    }

    await setUserDisabled({
      organizationId: session.organizationId,
      userId: input.userId,
      disabled: input.disabled,
    });

    revalidatePath("/settings/users");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    };
  }
}
