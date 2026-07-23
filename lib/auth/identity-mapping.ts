/**
 * Map authenticated IdP subject → ClientShield User (authorization source of truth).
 *
 * Rules:
 * - Lookup by externalId ONLY (never auto-link by email)
 * - Unknown IdP users are rejected
 * - Disabled users are rejected
 * - organizationId + role always come from the User row
 */
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthSession } from "@/lib/auth/types";

export class AuthMappingError extends Error {
  readonly code:
    | "NOT_PROVISIONED"
    | "DISABLED"
    | "INVALID_SUBJECT"
    | "MISCONFIGURED";

  constructor(
    code: AuthMappingError["code"],
    message: string
  ) {
    super(message);
    this.name = "AuthMappingError";
    this.code = code;
  }
}

export function toAuthSession(user: User): AuthSession {
  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    externalId: user.externalId,
  };
}

export async function resolveUserByExternalId(
  externalId: string
): Promise<User> {
  const subject = externalId.trim();
  if (!subject) {
    throw new AuthMappingError("INVALID_SUBJECT", "Missing identity subject");
  }

  const user = await prisma.user.findFirst({
    where: { externalId: subject },
  });

  if (!user) {
    throw new AuthMappingError(
      "NOT_PROVISIONED",
      "No ClientShield user is linked to this identity"
    );
  }

  if (user.disabledAt) {
    throw new AuthMappingError("DISABLED", "User account is disabled");
  }

  return user;
}

export async function touchLastLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

export async function loadDevBypassUser(input: {
  userId: string;
}): Promise<AuthSession> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId },
  });
  if (!user) {
    throw new AuthMappingError(
      "NOT_PROVISIONED",
      "AUTH_DEV_BYPASS user not found in database"
    );
  }
  if (user.disabledAt) {
    throw new AuthMappingError("DISABLED", "AUTH_DEV_BYPASS user is disabled");
  }
  return toAuthSession(user);
}

export type CreateOrgUserInput = {
  organizationId: string;
  email: string;
  name?: string | null;
  role: UserRole;
};

export async function createOrganizationUser(input: CreateOrgUserInput) {
  return prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email: input.email.toLowerCase().trim(),
      name: input.name?.trim() || null,
      role: input.role,
      externalId: null,
    },
  });
}

export async function linkUserExternalId(input: {
  organizationId: string;
  userId: string;
  externalId: string;
}) {
  const externalId = input.externalId.trim();
  if (!externalId) {
    throw new Error("externalId is required");
  }

  const user = await prisma.user.findFirst({
    where: { id: input.userId, organizationId: input.organizationId },
  });
  if (!user) {
    throw new Error("User not found");
  }
  if (user.disabledAt) {
    throw new Error("Cannot link identity on a disabled user");
  }

  const conflict = await prisma.user.findFirst({
    where: {
      externalId,
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  if (conflict) {
    throw new Error("externalId is already linked to another user");
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { externalId },
  });
}

export async function setUserDisabled(input: {
  organizationId: string;
  userId: string;
  disabled: boolean;
}) {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, organizationId: input.organizationId },
  });
  if (!user) {
    throw new Error("User not found");
  }
  return prisma.user.update({
    where: { id: user.id },
    data: { disabledAt: input.disabled ? new Date() : null },
  });
}
