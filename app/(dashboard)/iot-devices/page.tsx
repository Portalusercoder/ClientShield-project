import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "IoT Devices",
};

export const dynamic = "force-dynamic";

export default async function IoTDevicesPage() {
  await requireSession();

  return (
    <EmptyState
      title="IoT Device Inventory"
      description="Manage IoT device inventories for client deployments. Device scanning and monitoring will be integrated later."
    />
  );
}
