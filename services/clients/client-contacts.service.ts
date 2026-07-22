import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  CreateClientContactInput,
  UpdateClientContactInput,
} from "@/lib/validations/client-onboarding";
import type { ClientContactRecord } from "@/types/client-onboarding";

async function assertClientInOrganization(
  organizationId: string,
  clientId: string
): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true },
  });
  return client !== null;
}

function mapContact(row: {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  contactType: ClientContactRecord["contactType"];
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ClientContactRecord {
  return { ...row };
}

async function syncPrimaryOntoClient(
  tx: Prisma.TransactionClient,
  organizationId: string,
  clientId: string,
  contact: { name: string; email: string } | null
): Promise<void> {
  await tx.client.updateMany({
    where: { id: clientId, organizationId },
    data: {
      primaryContactName: contact?.name ?? null,
      primaryContactEmail: contact?.email ?? null,
    },
  });
}

/**
 * Lists contacts for a client. Contacts are NOT Users and do not grant login.
 */
export async function listClientContacts(
  organizationId: string,
  clientId: string
): Promise<ClientContactRecord[]> {
  const ok = await assertClientInOrganization(organizationId, clientId);
  if (!ok) return [];

  const rows = await prisma.clientContact.findMany({
    where: { organizationId, clientId },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });

  return rows.map(mapContact);
}

export async function getClientContactById(
  organizationId: string,
  contactId: string
): Promise<ClientContactRecord | null> {
  const row = await prisma.clientContact.findFirst({
    where: { id: contactId, organizationId },
  });
  return row ? mapContact(row) : null;
}

export async function createClientContact(
  organizationId: string,
  clientId: string,
  input: CreateClientContactInput
): Promise<ClientContactRecord | null> {
  const ok = await assertClientInOrganization(organizationId, clientId);
  if (!ok) return null;

  const makePrimary =
    input.isPrimary || input.contactType === "PRIMARY";

  const row = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.clientContact.updateMany({
        where: { organizationId, clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const created = await tx.clientContact.create({
      data: {
        organizationId,
        clientId,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        contactType: makePrimary ? "PRIMARY" : input.contactType,
        isPrimary: makePrimary,
      },
    });

    if (makePrimary) {
      await syncPrimaryOntoClient(tx, organizationId, clientId, {
        name: created.name,
        email: created.email,
      });
    }

    return created;
  });

  return mapContact(row);
}

export async function updateClientContact(
  organizationId: string,
  contactId: string,
  input: UpdateClientContactInput
): Promise<ClientContactRecord | null> {
  const existing = await prisma.clientContact.findFirst({
    where: { id: contactId, organizationId },
  });
  if (!existing) return null;

  const makePrimary =
    input.isPrimary === true || input.contactType === "PRIMARY"
      ? true
      : input.isPrimary === false
        ? false
        : existing.isPrimary;

  const row = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.clientContact.updateMany({
        where: {
          organizationId,
          clientId: existing.clientId,
          isPrimary: true,
          NOT: { id: contactId },
        },
        data: { isPrimary: false },
      });
    }

    const updated = await tx.clientContact.update({
      where: { id: contactId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.jobTitle !== undefined
          ? { jobTitle: input.jobTitle ?? null }
          : {}),
        contactType: makePrimary
          ? "PRIMARY"
          : (input.contactType ??
            (existing.contactType === "PRIMARY" ? "OTHER" : existing.contactType)),
        isPrimary: makePrimary,
      },
    });

    if (makePrimary) {
      await syncPrimaryOntoClient(tx, organizationId, existing.clientId, {
        name: updated.name,
        email: updated.email,
      });
    } else if (existing.isPrimary) {
      const nextPrimary = await tx.clientContact.findFirst({
        where: {
          organizationId,
          clientId: existing.clientId,
          isPrimary: true,
        },
      });
      await syncPrimaryOntoClient(
        tx,
        organizationId,
        existing.clientId,
        nextPrimary
          ? { name: nextPrimary.name, email: nextPrimary.email }
          : null
      );
    }

    return updated;
  });

  return mapContact(row);
}

/**
 * Soft-removes a contact by deleting the contact row only (not the Client).
 * Never deletes the Client or related security data.
 */
export async function deleteClientContact(
  organizationId: string,
  contactId: string
): Promise<boolean> {
  const existing = await prisma.clientContact.findFirst({
    where: { id: contactId, organizationId },
  });
  if (!existing) return false;

  await prisma.$transaction(async (tx) => {
    await tx.clientContact.delete({ where: { id: contactId } });

    if (existing.isPrimary) {
      const nextPrimary = await tx.clientContact.findFirst({
        where: {
          organizationId,
          clientId: existing.clientId,
          isPrimary: true,
        },
      });
      await syncPrimaryOntoClient(
        tx,
        organizationId,
        existing.clientId,
        nextPrimary
          ? { name: nextPrimary.name, email: nextPrimary.email }
          : null
      );
    }
  });

  return true;
}
