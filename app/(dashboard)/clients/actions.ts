"use server";

import { revalidatePath } from "next/cache";
import type { ClientServiceType, ClientStatus } from "@prisma/client";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  clientFiltersSchema,
  clientIdSchema,
  createClientSchema,
  updateClientSchema,
} from "@/lib/validations/clients";
import {
  createClientContactSchema,
  updateClientContactSchema,
  enableClientServiceSchema,
  clientServiceActionSchema,
  updateOnboardingStepSchema,
  transitionClientStatusSchema,
  organizationSettingsSchema,
} from "@/lib/validations/client-onboarding";
import { createAuditLog } from "@/services/audit.service";
import {
  archiveClient,
  createClient,
  updateClient,
} from "@/services/clients.service";
import {
  createClientContact,
  deleteClientContact,
  updateClientContact,
} from "@/services/clients/client-contacts.service";
import {
  disableClientService,
  enableClientService,
  pauseClientService,
} from "@/services/clients/client-services.service";
import {
  completeClientOnboarding,
  updateClientOnboardingStep,
} from "@/services/clients/client-onboarding.service";
import { transitionClientStatus } from "@/services/clients/client-lifecycle.service";
import { upsertOrganizationSettings } from "@/services/organization/organization-settings.service";
import { updateAsset } from "@/services/assets.service";
import { assetIdSchema } from "@/lib/validations/assets";
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

function revalidateClientPaths(clientId: string) {
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/onboarding`);
  revalidatePath("/");
}

export async function createClientAction(
  formData: FormData
): Promise<ClientActionResult<{ id: string; redirectTo: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = createClientSchema.safeParse({
      name: formData.get("name"),
      industry: formData.get("industry"),
      country: formData.get("country"),
      timezone: formData.get("timezone"),
      primaryContactName: formData.get("primaryContactName"),
      primaryContactEmail: formData.get("primaryContactEmail"),
      phone: formData.get("phone"),
      website: formData.get("website"),
      notes: formData.get("notes"),
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

    revalidateClientPaths(client.id);

    return {
      success: true,
      data: {
        id: client.id,
        redirectTo: `/clients/${client.id}/onboarding`,
      },
    };
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
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = updateClientSchema.safeParse({
      name: formData.get("name") || undefined,
      industry: formData.get("industry"),
      country: formData.get("country"),
      timezone: formData.get("timezone"),
      primaryContactName: formData.get("primaryContactName"),
      primaryContactEmail: formData.get("primaryContactEmail"),
      phone: formData.get("phone"),
      website: formData.get("website"),
      notes: formData.get("notes"),
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

    revalidateClientPaths(client.id);

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
      metadata: { name: client.name, status: client.status },
    });

    revalidateClientPaths(client.id);

    return { success: true, data: { id: client.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function transitionClientStatusAction(
  clientId: string,
  toStatus: ClientStatus
): Promise<ClientActionResult<{ id: string; status: ClientStatus }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const statusParsed = transitionClientStatusSchema.safeParse({ toStatus });
    if (!statusParsed.success) {
      return {
        success: false,
        error: statusParsed.error.errors[0]?.message ?? "Invalid status",
      };
    }

    const client = await transitionClientStatus(
      session.organizationId,
      idParsed.data.id,
      statusParsed.data.toStatus
    );

    if (!client) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_STATUS_TRANSITIONED",
      resourceType: "Client",
      resourceId: client.id,
      metadata: { toStatus: client.status },
    });

    revalidateClientPaths(client.id);

    return {
      success: true,
      data: { id: client.id, status: client.status },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createClientContactAction(
  clientId: string,
  formData: FormData
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = createClientContactSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      jobTitle: formData.get("jobTitle"),
      contactType: formData.get("contactType") || "OTHER",
      isPrimary: formData.get("isPrimary") === "true" || formData.get("isPrimary") === "on",
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const contact = await createClientContact(
      session.organizationId,
      idParsed.data.id,
      parsed.data
    );

    if (!contact) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_CONTACT_CREATED",
      resourceType: "ClientContact",
      resourceId: contact.id,
      metadata: {
        clientId: contact.clientId,
        email: contact.email,
        contactType: contact.contactType,
      },
    });

    revalidateClientPaths(contact.clientId);

    return { success: true, data: { id: contact.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateClientContactAction(
  contactId: string,
  formData: FormData
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const parsed = updateClientContactSchema.safeParse({
      name: formData.get("name") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone"),
      jobTitle: formData.get("jobTitle"),
      contactType: formData.get("contactType") || undefined,
      isPrimary:
        formData.get("isPrimary") === "true" || formData.get("isPrimary") === "on"
          ? true
          : formData.get("isPrimary") === "false"
            ? false
            : undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const contact = await updateClientContact(
      session.organizationId,
      contactId,
      parsed.data
    );

    if (!contact) {
      return { success: false, error: "Contact not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_CONTACT_UPDATED",
      resourceType: "ClientContact",
      resourceId: contact.id,
      metadata: {
        clientId: contact.clientId,
        email: contact.email,
      },
    });

    revalidateClientPaths(contact.clientId);

    return { success: true, data: { id: contact.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteClientContactAction(
  contactId: string,
  clientId: string
): Promise<ClientActionResult> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const deleted = await deleteClientContact(
      session.organizationId,
      contactId
    );

    if (!deleted) {
      return { success: false, error: "Contact not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_CONTACT_DELETED",
      resourceType: "ClientContact",
      resourceId: contactId,
      metadata: { clientId: idParsed.data.id },
    });

    revalidateClientPaths(idParsed.data.id);

    return { success: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enableClientServiceAction(
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = enableClientServiceSchema.safeParse({ serviceType });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid service",
      };
    }

    const service = await enableClientService(
      session.organizationId,
      idParsed.data.id,
      parsed.data
    );

    if (!service) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_SERVICE_ENABLED",
      resourceType: "ClientService",
      resourceId: service.id,
      metadata: {
        clientId: service.clientId,
        serviceType: service.serviceType,
        status: service.status,
      },
    });

    revalidateClientPaths(service.clientId);

    return { success: true, data: { id: service.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function pauseClientServiceAction(
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = clientServiceActionSchema.safeParse({ serviceType });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid service",
      };
    }

    const service = await pauseClientService(
      session.organizationId,
      idParsed.data.id,
      parsed.data.serviceType
    );

    if (!service) {
      return { success: false, error: "Service not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_SERVICE_PAUSED",
      resourceType: "ClientService",
      resourceId: service.id,
      metadata: {
        clientId: service.clientId,
        serviceType: service.serviceType,
      },
    });

    revalidateClientPaths(service.clientId);

    return { success: true, data: { id: service.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function disableClientServiceAction(
  clientId: string,
  serviceType: ClientServiceType
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = clientServiceActionSchema.safeParse({ serviceType });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid service",
      };
    }

    const service = await disableClientService(
      session.organizationId,
      idParsed.data.id,
      parsed.data.serviceType
    );

    if (!service) {
      return { success: false, error: "Service not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_SERVICE_DISABLED",
      resourceType: "ClientService",
      resourceId: service.id,
      metadata: {
        clientId: service.clientId,
        serviceType: service.serviceType,
      },
    });

    revalidateClientPaths(service.clientId);

    return { success: true, data: { id: service.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateOnboardingStepAction(
  clientId: string,
  step: string,
  status?: string
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const parsed = updateOnboardingStepSchema.safeParse({ step, status });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid step",
      };
    }

    const onboarding = await updateClientOnboardingStep(
      session.organizationId,
      idParsed.data.id,
      parsed.data
    );

    if (!onboarding) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_ONBOARDING_STEP_UPDATED",
      resourceType: "ClientOnboarding",
      resourceId: onboarding.id,
      metadata: {
        clientId: onboarding.clientId,
        step: onboarding.currentStep,
        status: onboarding.status,
      },
    });

    revalidateClientPaths(onboarding.clientId);

    return { success: true, data: { id: onboarding.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeOnboardingAction(
  clientId: string
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = clientIdSchema.safeParse({ id: clientId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid client ID" };
    }

    const onboarding = await completeClientOnboarding(
      session.organizationId,
      idParsed.data.id
    );

    if (!onboarding) {
      return { success: false, error: "Client not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "CLIENT_ONBOARDING_COMPLETED",
      resourceType: "ClientOnboarding",
      resourceId: onboarding.id,
      metadata: {
        clientId: onboarding.clientId,
        status: onboarding.status,
      },
    });

    // Promote to ACTIVE when onboarding completes successfully
    try {
      await transitionClientStatus(
        session.organizationId,
        idParsed.data.id,
        "ACTIVE"
      );
      await createAuditLog({
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "CLIENT_STATUS_TRANSITIONED",
        resourceType: "Client",
        resourceId: idParsed.data.id,
        metadata: { toStatus: "ACTIVE", reason: "onboarding_completed" },
      });
    } catch {
      // Lifecycle may already be ACTIVE or transition blocked — onboarding still completed
    }

    revalidateClientPaths(idParsed.data.id);

    return { success: true, data: { id: onboarding.id } };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * ADMIN-only asset authorization update for onboarding.
 * Does not auto-authorize — caller must pass an explicit status.
 */
export async function updateAssetAuthorizationAction(
  assetId: string,
  clientId: string,
  authorizationStatus: "NOT_AUTHORIZED" | "PENDING" | "AUTHORIZED"
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const assetParsed = assetIdSchema.safeParse({ id: assetId });
    const clientParsed = clientIdSchema.safeParse({ id: clientId });
    if (!assetParsed.success || !clientParsed.success) {
      return { success: false, error: "Invalid asset or client ID" };
    }

    const asset = await updateAsset(
      session.organizationId,
      assetParsed.data.id,
      { authorizationStatus }
    );

    if (!asset || asset.clientId !== clientParsed.data.id) {
      return { success: false, error: "Asset not found for this client" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "ASSET_AUTHORIZATION_CHANGED",
      resourceType: "Asset",
      resourceId: asset.id,
      metadata: {
        clientId: asset.clientId,
        authorizationStatus: asset.authorizationStatus,
      },
    });

    revalidateClientPaths(asset.clientId);
    revalidatePath(`/assets/${asset.id}`);

    return { success: true, data: { id: asset.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateOrganizationSettingsAction(
  formData: FormData
): Promise<ClientActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    // OWNER and ADMIN can update org settings (OWNER ≥ ADMIN in hierarchy)
    assertMinimumRole(session, "ADMIN");

    const parsed = organizationSettingsSchema.safeParse({
      displayName: formData.get("displayName"),
      defaultTimezone: formData.get("defaultTimezone"),
      securityContactEmail: formData.get("securityContactEmail"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const settings = await upsertOrganizationSettings(
      session.organizationId,
      parsed.data
    );

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "ORGANIZATION_SETTINGS_UPDATED",
      resourceType: "OrganizationSettings",
      resourceId: settings.id,
      metadata: {
        displayName: settings.displayName,
        defaultTimezone: settings.defaultTimezone,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/settings/users");

    return { success: true, data: { id: settings.id } };
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
    onboardingStatus: searchParams.onboardingStatus,
    readiness: searchParams.readiness,
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
