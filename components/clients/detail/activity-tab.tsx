import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { ClientActivityItem } from "@/types/client-onboarding";

export function ActivityTab({ activity }: { activity: ClientActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Client lifecycle and configuration changes will appear here."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {activity.map((item) => (
        <li
          key={item.id}
          className="rounded-md border border-border px-4 py-3 text-sm"
        >
          <p className="font-medium text-foreground">{item.action}</p>
          <p className="text-muted">
            {item.resourceType}
            {item.resourceId ? ` · ${item.resourceId}` : ""} ·{" "}
            {formatDate(item.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
