import { prisma } from "@/lib/db";

export async function getOrganizationBrand(organizationId: string): Promise<{
  organizationId: string;
  organizationName: string;
}> {
  const org = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("Organization not found");
  return { organizationId: org.id, organizationName: org.name };
}

export function reportFilename(
  kind: string,
  format: "pdf" | "csv",
  generatedAt = new Date()
): string {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `clientshield-${kind.toLowerCase().replace(/_/g, "-")}-${stamp}.${format}`;
}
