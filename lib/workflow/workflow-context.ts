/**
 * Analyst workflow spine (Phase 6b5).
 * Lightweight stage model — not a graphical diagram.
 */
export type WorkflowStageId =
  | "security-event"
  | "investigation"
  | "finding"
  | "incident";

/** Visual / navigation state for a workflow stage. */
export type WorkflowStageStatus =
  | "current"
  | "completed"
  | "available"
  | "empty";

export type WorkflowStage = {
  id: WorkflowStageId;
  label: string;
  status: WorkflowStageStatus;
  /** Internal path when navigable. */
  href: string | null;
  /** Short label for the linked object. */
  title: string | null;
};

export type WorkflowQuickAction = {
  id: string;
  label: string;
  /** Prefer href for deep links (preserves browser history). */
  href?: string | null;
  /** When true, action is hidden or shown disabled with reason. */
  available: boolean;
  reason?: string | null;
};

export type WorkflowRelatedObject = {
  id: string;
  kind: WorkflowStageId | "asset" | "endpoint";
  label: string;
  href: string;
  meta?: string | null;
};

export const WORKFLOW_STAGE_ORDER: WorkflowStageId[] = [
  "security-event",
  "investigation",
  "finding",
  "incident",
];

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStageId, string> = {
  "security-event": "Security Event",
  investigation: "Investigation",
  finding: "Finding",
  incident: "Incident",
};

export function buildWorkflowStages(input: {
  current: WorkflowStageId;
  securityEvent?: { id: string; title: string } | null;
  investigation?: { id: string; title: string } | null;
  finding?: { id: string; title: string } | null;
  incident?: { id: string; title: string } | null;
}): WorkflowStage[] {
  const currentIndex = WORKFLOW_STAGE_ORDER.indexOf(input.current);

  const refs: Record<
    WorkflowStageId,
    { id: string; title: string; href: string } | null
  > = {
    "security-event": input.securityEvent
      ? {
          id: input.securityEvent.id,
          title: input.securityEvent.title,
          href: `/security-events/${input.securityEvent.id}`,
        }
      : null,
    investigation: input.investigation
      ? {
          id: input.investigation.id,
          title: input.investigation.title,
          href: `/investigations/${input.investigation.id}`,
        }
      : null,
    finding: input.finding
      ? {
          id: input.finding.id,
          title: input.finding.title,
          href: `/vulnerabilities/${input.finding.id}`,
        }
      : null,
    incident: input.incident
      ? {
          id: input.incident.id,
          title: input.incident.title,
          href: `/incidents/${input.incident.id}`,
        }
      : null,
  };

  return WORKFLOW_STAGE_ORDER.map((id, index) => {
    const ref = refs[id];
    let status: WorkflowStageStatus;
    if (id === input.current) {
      status = "current";
    } else if (ref) {
      status = index < currentIndex ? "completed" : "available";
    } else {
      status = "empty";
    }
    return {
      id,
      label: WORKFLOW_STAGE_LABELS[id],
      status,
      href: ref?.href ?? null,
      title: ref?.title ?? null,
    };
  });
}
