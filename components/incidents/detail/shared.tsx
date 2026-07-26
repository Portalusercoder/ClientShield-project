import type { IncidentStatus, ResponseTaskStatus } from "@prisma/client";

export type Tab =
  | "overview"
  | "timeline"
  | "playbook"
  | "tasks"
  | "evidence"
  | "security-events"
  | "findings"
  | "response"
  | "post-incident"
  | "notes";

export interface LinkedSecurityEventRow {
  linkId: string;
  id: string;
  title: string;
  severity: string;
  status: string;
  ruleId: string | null;
  ruleDescription?: string | null;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  assetId?: string | null;
  assetName?: string | null;
}

export interface PlaybookInstanceRow {
  id: string;
  playbookName: string;
  sourcePlaybookId: string | null;
  assignedAt: Date;
  assignedByName: string | null;
  taskCount: number;
}

export interface CandidateUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export const PHASE_STEPS: { status: IncidentStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "ACKNOWLEDGED", label: "Triage" },
  { status: "INVESTIGATING", label: "Investigate" },
  { status: "CONTAINED", label: "Contain" },
  { status: "ERADICATED", label: "Eradicate" },
  { status: "RECOVERING", label: "Recover" },
  { status: "RESOLVED", label: "Resolve" },
  { status: "CLOSED", label: "Close" },
];

export const TASK_STATUSES: ResponseTaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
];

export const PLAYBOOK_PHASES = [
  "INVESTIGATION",
  "CONTAINMENT",
  "ERADICATION",
  "RECOVERY",
  "POST_INCIDENT",
] as const;

export function formatDuration(ms: number | null): string {
  if (ms == null) return "N/A";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 48) return `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export { MetadataField as Field } from "@/components/ui/metadata-field";

export function PhaseStepper({ status }: { status: IncidentStatus }) {
  const currentIdx = PHASE_STEPS.findIndex((s) => s.status === status);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface/40 px-3 py-3">
      <ol className="flex min-w-[640px] items-center gap-1">
        {PHASE_STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={step.status} className="flex flex-1 items-center gap-1">
              <div className="flex min-w-0 flex-col items-center gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-accent text-white"
                      : done
                        ? "bg-success/20 text-success"
                        : "bg-border/60 text-muted"
                  }`}
                >
                  {idx + 1}
                </span>
                <span
                  className={`truncate text-[10px] uppercase tracking-wide ${
                    active ? "text-accent" : "text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < PHASE_STEPS.length - 1 && (
                <div
                  className={`mb-4 h-0.5 flex-1 ${
                    done ? "bg-success/50" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
