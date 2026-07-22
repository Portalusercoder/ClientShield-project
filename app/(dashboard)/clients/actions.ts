"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  clientFiltersSchema,
  clientIdSchema,
  createClientSchema,
  updateClientSchema,
} from "@/lib/validations/clients";
import { createAuditLog } from "@/services/audit.service";
import {
  archiveClient,
  createClient,
  updateClient,
} from "@/services/clients.service";
import type { ClientActionResult } from "@/types/client";

function toActionError(error: unknown): ClientActionResult<never> {
  if (error instanceof Error) {
    if (error.message === "Unauthorized" || error.message === "Forbidden") {
      return { success: false, error: error.message };
    }
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

export async function createClientAction(
  formData: FormData
): Promise<ClientActionResult<{ id: string }>> {
  try {
    // TODO: Replace with production IdP session validation.
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = createClientSchema.safeParse({
      name: formData.get("name"),
      industry: formData.get("industry"),
      primaryContactName: formData.get("primaryContactName"),
      primaryContactEmail: formData.get("primaryContactEmail"),
      phone: formData.get("phone"),
      website: formData.get("website"),
      status: formData.get("status") || "ONBOARDING",
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const client = await createClient(session.organizationId, parsed.data);

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_CREATED",
      resourceType: "Client",
      resourceId: client.id,
      metadata: { name: client.name, status: client.status },
    });

    revalidatePath("/clients");
    revalidatePath("/");

    return { success: true, data: { id: client.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateClientAction(
  clientId: string,
  formData: FormData
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = updateClientSchema.safeParse({
      name: formData.get("name") || undefined,
      industry: formData.get("industry"),
      primaryContactName: formData.get("primaryContactName"),
      primaryContactEmail: formData.get("primaryContactEmail"),
      phone: formData.get("phone"),
      website: formData.get("website"),
      status: formData.get("status") || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const client = await updateClient(
      session.organizationId,
      idParsed.data.id,
      parsed.data
    );

    if (!client) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_UPDATED",
      resourceType: "Client",
      resourceId: client.id,
      metadata: { name: client.name, status: client.status },
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${client.id}`);
    revalidatePath("/");

    return { success: true, data: { id: client.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveClientAction(
  clientId: string
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const client = await archiveClient(
      session.organizationId,
      idParsed.data.id
    );

    if (!client) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_ARCHIVED",
      resourceType: "Client",
      resourceId: client.id,
      metadata: { name: client.name },
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${client.id}`);
    revalidatePath("/");

    return { success: true, data: { id: client.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function parseClientFilters(
  searchParams: Record<string, string | string[] | undefined>
) {
  const session = await requireSession();

  const parsed = clientFiltersSchema.safeParse({
    search: searchParams.search,
    status: searchParams.status,
    industry: searchParams.industry,
    page: searchParams.page,
    pageSize: searchParams.pageSize,
  });

  if (!parsed.success) {
    return {
      organizationId: session.organizationId,
      filters: { page: 1, pageSize: 20 },
    };
  }

  return {
    organizationId: session.organizationId,
    filters: parsed.data,
  };
}
