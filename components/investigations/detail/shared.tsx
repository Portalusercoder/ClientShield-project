import type { InvestigationDetailViewModel } from "@/types/investigations";

export type Tab =
  | "overview"
  | "events"
  | "observables"
  | "mitre"
  | "notes"
  | "findings"
  | "timeline"
  | "threat-intel"
  | "incidents";

export type RunActionFn = (
  fn: () => Promise<{ success: boolean; error?: string }>,
  successMessage: string
) => void;

export interface TabBaseProps {
  investigation: InvestigationDetailViewModel;
  canAct: boolean;
  closed: boolean;
  isPending: boolean;
  runAction: RunActionFn;
}

export function userLabel(user: {
  name: string | null;
  email: string;
} | null): string {
  if (!user) return "—";
  return user.name?.trim() || user.email;
}

export { MetadataField as Field } from "@/components/ui/metadata-field";
