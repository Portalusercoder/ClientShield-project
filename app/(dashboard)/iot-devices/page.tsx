import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "IoT Devices",
};

export default function IoTDevicesPage() {
  return (
    <EmptyState
      title="IoT Device Inventory"
      description="Manage IoT device inventories for client deployments. Device scanning and monitoring will be integrated later."
    />
  );
}
