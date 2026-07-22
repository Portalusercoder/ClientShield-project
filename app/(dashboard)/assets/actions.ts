"use server";

import { revalidatePath } from "next/cache";
import { assertMinimumRole, requireSession } from "@/lib/auth";
import {
  assetIdSchema,
  createAssetSchema,
  updateAssetSchema,
} from "@/lib/validations/assets";
import { createAuditLog } from "@/services/audit.service";
import {
  archiveAsset,
  createAsset,
  getAssetById,
  updateAsset,
} from "@/services/assets.service";
import type { AssetActionResult } from "@/types/asset";

function toActionError(error: unknown): AssetActionResult<never> {
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "An unexpected error occurred" };
}

export async function createAssetAction(
  formData: FormData
): Promise<AssetActionResult<{ id: string }>> {
  try {
    // TODO: Replace with production IdP session validation.
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const parsed = createAssetSchema.safeParse({
      clientId: formData.get("clientId"),
      name: formData.get("name"),
      type: formData.get("type"),
      location: formData.get("location"),
      environment: formData.get("environment") || "PRODUCTION",
      criticality: formData.get("criticality") || "MEDIUM",
      monitoringStatus: formData.get("monitoringStatus") || "ACTIVE",
      authorizationStatus: formData.get("authorizationStatus") || "PENDING",
      description: formData.get("description"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const asset = await createAsset(session.organizationId, parsed.data);

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "ASSET_CREATED",
      resourceType: "Asset",
      resourceId: asset.id,
      metadata: {
        name: asset.name,
        type: asset.type,
        clientId: asset.clientId,
        authorizationStatus: asset.authorizationStatus,
      },
    });

    revalidatePath("/assets");
    revalidatePath(`/assets/${asset.id}`);
    revalidatePath(`/clients/${asset.clientId}`);
    revalidatePath("/");

    return { success: true, data: { id: asset.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssetAction(
  assetId: string,
  formData: FormData
): Promise<AssetActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");

    const idParsed = assetIdSchema.safeParse({ id: assetId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid asset ID" };
    }

    const existing = await getAssetById(
      session.organizationId,
      idParsed.data.id
    );
    if (!existing) {
      return { success: false, error: "Asset not found" };
    }

    const parsed = updateAssetSchema.safeParse({
      clientId: formData.get("clientId") || undefined,
      name: formData.get("name") || undefined,
      type: formData.get("type") || undefined,
      location: formData.get("location") || undefined,
      environment: formData.get("environment") || undefined,
      criticality: formData.get("criticality") || undefined,
      monitoringStatus: formData.get("monitoringStatus") || undefined,
      authorizationStatus: formData.get("authorizationStatus") || undefined,
      description: formData.get("description"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Validation failed",
      };
    }

    const asset = await updateAsset(
      session.organizationId,
      idParsed.data.id,
      parsed.data
    );

    if (!asset) {
      return { success: false, error: "Asset not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "ASSET_UPDATED",
      resourceType: "Asset",
      resourceId: asset.id,
      metadata: {
        name: asset.name,
        type: asset.type,
        monitoringStatus: asset.monitoringStatus,
      },
    });

    if (
      parsed.data.authorizationStatus &&
      parsed.data.authorizationStatus !== existing.authorizationStatus
    ) {
      await createAuditLog({
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "ASSET_AUTHORIZATION_CHANGED",
        resourceType: "Asset",
        resourceId: asset.id,
        metadata: {
          from: existing.authorizationStatus,
          to: asset.authorizationStatus,
        },
      });
    }

    revalidatePath("/assets");
    revalidatePath(`/assets/${asset.id}`);
    revalidatePath(`/clients/${asset.clientId}`);
    revalidatePath("/");

    return { success: true, data: { id: asset.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveAssetAction(
  assetId: string
): Promise<AssetActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ADMIN");

    const idParsed = assetIdSchema.safeParse({ id: assetId });
    if (!idParsed.success) {
      return { success: false, error: "Invalid asset ID" };
    }

    const asset = await archiveAsset(
      session.organizationId,
      idParsed.data.id
    );

    if (!asset) {
      return { success: false, error: "Asset not found" };
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: "ASSET_ARCHIVED",
      resourceType: "Asset",
      resourceId: asset.id,
      metadata: { name: asset.name },
    });

    revalidatePath("/assets");
    revalidatePath(`/assets/${asset.id}`);
    revalidatePath(`/clients/${asset.clientId}`);
    revalidatePath("/");

    return { success: true, data: { id: asset.id } };
  } catch (error) {
    return toActionError(error);
  }
}
