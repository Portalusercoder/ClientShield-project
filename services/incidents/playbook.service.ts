import type {
  IncidentCategory,
  IncidentSeverity,
  PlaybookPhase,
  Prisma,
  ResponseTaskPriority,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeIncidentText } from "@/lib/incidents/sanitize";
import { createAuditLog } from "@/services/audit.service";
import { appendIncidentActivity } from "@/services/incidents/activity";
import type {
  PlaybookDetail,
  PlaybookListItem,
  PlaybookSuggestion,
} from "@/types/incident-case";

const SYSTEM_PLAYBOOK_SEEDS: Array<{
  id: string;
  name: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  steps: Array<{
    id: string;
    order: number;
    phase: PlaybookPhase;
    title: string;
    description: string;
    isRequired: boolean;
    defaultPriority: ResponseTaskPriority;
  }>;
}> = [
  {
    id: "syspb_malware_investigation",
    name: "Malware Investigation",
    description:
      "Investigate and contain suspected malware on endpoints or servers.",
    category: "MALWARE",
    severity: "HIGH",
    steps: [
      {
        id: "syspb_malware_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Identify infected hosts",
        description:
          "Enumerate affected endpoints, processes, and initial indicators.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_malware_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Collect malware samples and IOCs",
        description: "Preserve samples, hashes, and network indicators safely.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_malware_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Isolate affected systems",
        description: "Network-isolate or quarantine confirmed infected hosts.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_malware_s4",
        order: 4,
        phase: "ERADICATION",
        title: "Remove malware and persistence",
        description: "Clean or rebuild hosts; remove persistence mechanisms.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_malware_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Restore systems and validate",
        description: "Return systems to service after validation scans.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_malware_s6",
        order: 6,
        phase: "POST_INCIDENT",
        title: "Document lessons and update detections",
        description: "Capture root cause and improve detection rules.",
        isRequired: false,
        defaultPriority: "MEDIUM",
      },
    ],
  },
  {
    id: "syspb_suspicious_auth",
    name: "Suspicious Authentication Activity",
    description:
      "Investigate anomalous logins, MFA failures, and credential abuse.",
    category: "ACCOUNT_COMPROMISE",
    severity: "HIGH",
    steps: [
      {
        id: "syspb_auth_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Review authentication logs",
        description:
          "Correlate failed/successful logins, geo, device, and MFA signals.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_auth_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Identify compromised accounts",
        description: "Confirm account takeover indicators and blast radius.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_auth_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Force password reset / revoke sessions",
        description: "Reset credentials and revoke active sessions/tokens.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_auth_s4",
        order: 4,
        phase: "CONTAINMENT",
        title: "Enforce MFA / lock high-risk accounts",
        description:
          "Temporarily lock or step-up authentication for risk accounts.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_auth_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Restore legitimate access",
        description: "Re-enable accounts after verification with owners.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_auth_s6",
        order: 6,
        phase: "POST_INCIDENT",
        title: "Tune auth detection rules",
        description: "Update alerting thresholds and identity controls.",
        isRequired: false,
        defaultPriority: "LOW",
      },
    ],
  },
  {
    id: "syspb_endpoint_alert",
    name: "Endpoint Security Alert",
    description: "Triage and respond to EDR/SIEM endpoint detections.",
    category: "SUSPICIOUS_ACTIVITY",
    severity: "MEDIUM",
    steps: [
      {
        id: "syspb_endpoint_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Triage endpoint alert",
        description:
          "Validate severity, false positive likelihood, and host context.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_endpoint_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Collect endpoint telemetry",
        description: "Gather process tree, file paths, and related alerts.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_endpoint_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Contain host if confirmed malicious",
        description: "Isolate endpoint via EDR when threat is confirmed.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_endpoint_s4",
        order: 4,
        phase: "ERADICATION",
        title: "Remediate endpoint threat",
        description: "Quarantine files, kill processes, remove persistence.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_endpoint_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Verify host health",
        description:
          "Confirm clean state before rejoining production network.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
    ],
  },
  {
    id: "syspb_web_app_incident",
    name: "Web Application Security Incident",
    description:
      "Respond to web application attacks and exploitation attempts.",
    category: "WEB_ATTACK",
    severity: "HIGH",
    steps: [
      {
        id: "syspb_web_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Analyze attack traffic and payloads",
        description:
          "Review WAF/app logs for attack patterns and success indicators.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_web_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Assess data exposure impact",
        description:
          "Determine whether sensitive data or sessions were compromised.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_web_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Block attacker IPs / enable WAF rules",
        description: "Apply temporary blocks and tighten WAF policies.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_web_s4",
        order: 4,
        phase: "ERADICATION",
        title: "Patch vulnerable endpoint",
        description: "Deploy fix or temporary mitigation for exploited issue.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_web_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Validate application integrity",
        description: "Regression-test critical flows and monitoring.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_web_s6",
        order: 6,
        phase: "POST_INCIDENT",
        title: "Update app security controls",
        description: "Document findings and schedule hardening work.",
        isRequired: false,
        defaultPriority: "MEDIUM",
      },
    ],
  },
  {
    id: "syspb_unauthorized_access",
    name: "Unauthorized Access",
    description:
      "Investigate and contain unauthorized access to systems or data.",
    category: "UNAUTHORIZED_ACCESS",
    severity: "HIGH",
    steps: [
      {
        id: "syspb_unauth_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Determine access vector",
        description: "Identify how unauthorized access was obtained.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_unauth_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Map accessed resources",
        description: "List systems, data stores, and actions performed.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_unauth_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Revoke unauthorized access",
        description: "Disable accounts, keys, and network paths used.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_unauth_s4",
        order: 4,
        phase: "ERADICATION",
        title: "Remove backdoors and excess privileges",
        description:
          "Hunt for persistence and correct IAM misconfigurations.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_unauth_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Restore least-privilege access",
        description: "Re-provision legitimate access under least privilege.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_unauth_s6",
        order: 6,
        phase: "POST_INCIDENT",
        title: "Improve access reviews",
        description: "Schedule access review and control improvements.",
        isRequired: false,
        defaultPriority: "LOW",
      },
    ],
  },
  {
    id: "syspb_generic_security",
    name: "Generic Security Incident",
    description:
      "General-purpose response playbook when no specific template fits.",
    category: "OTHER",
    severity: "MEDIUM",
    steps: [
      {
        id: "syspb_generic_s1",
        order: 1,
        phase: "INVESTIGATION",
        title: "Establish facts and timeline",
        description: "Capture what happened, when, and who is affected.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_generic_s2",
        order: 2,
        phase: "INVESTIGATION",
        title: "Assess scope and impact",
        description: "Determine business and technical impact.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_generic_s3",
        order: 3,
        phase: "CONTAINMENT",
        title: "Contain the threat",
        description: "Stop ongoing damage with least-disruptive controls.",
        isRequired: true,
        defaultPriority: "CRITICAL",
      },
      {
        id: "syspb_generic_s4",
        order: 4,
        phase: "ERADICATION",
        title: "Eliminate root cause",
        description: "Remove the underlying issue enabling the incident.",
        isRequired: true,
        defaultPriority: "HIGH",
      },
      {
        id: "syspb_generic_s5",
        order: 5,
        phase: "RECOVERY",
        title: "Restore normal operations",
        description: "Validate systems and return to steady state.",
        isRequired: true,
        defaultPriority: "MEDIUM",
      },
      {
        id: "syspb_generic_s6",
        order: 6,
        phase: "POST_INCIDENT",
        title: "Conduct post-incident review",
        description: "Capture lessons learned and follow-up actions.",
        isRequired: false,
        defaultPriority: "MEDIUM",
      },
    ],
  },
];

function mapPlaybookListItem(p: {
  id: string;
  name: string;
  description: string | null;
  category: IncidentCategory | null;
  severity: IncidentSeverity | null;
  isActive: boolean;
  isSystemTemplate: boolean;
  organizationId: string | null;
  _count: { steps: number };
}): PlaybookListItem {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    severity: p.severity,
    isActive: p.isActive,
    isSystemTemplate: p.isSystemTemplate,
    organizationId: p.organizationId,
    stepCount: p._count.steps,
  };
}

/**
 * Idempotent seed of system playbooks for tests / environments without migration seed.
 */
export async function ensureSystemPlaybooksExist(): Promise<void> {
  for (const seed of SYSTEM_PLAYBOOK_SEEDS) {
    await prisma.incidentPlaybook.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        organizationId: null,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        severity: seed.severity,
        isActive: true,
        isSystemTemplate: true,
        steps: {
          create: seed.steps.map((s) => ({
            id: s.id,
            order: s.order,
            phase: s.phase,
            title: s.title,
            description: s.description,
            isRequired: s.isRequired,
            defaultPriority: s.defaultPriority,
          })),
        },
      },
      update: {
        name: seed.name,
        description: seed.description,
        category: seed.category,
        severity: seed.severity,
        isActive: true,
        isSystemTemplate: true,
      },
    });

    for (const step of seed.steps) {
      await prisma.playbookStep.upsert({
        where: { id: step.id },
        create: {
          id: step.id,
          playbookId: seed.id,
          order: step.order,
          phase: step.phase,
          title: step.title,
          description: step.description,
          isRequired: step.isRequired,
          defaultPriority: step.defaultPriority,
        },
        update: {
          order: step.order,
          phase: step.phase,
          title: step.title,
          description: step.description,
          isRequired: step.isRequired,
          defaultPriority: step.defaultPriority,
        },
      });
    }
  }
}

export async function listPlaybooks(
  organizationId: string
): Promise<PlaybookListItem[]> {
  const playbooks = await prisma.incidentPlaybook.findMany({
    where: {
      isActive: true,
      OR: [{ organizationId: null, isSystemTemplate: true }, { organizationId }],
    },
    include: { _count: { select: { steps: true } } },
    orderBy: [{ isSystemTemplate: "desc" }, { name: "asc" }],
  });
  return playbooks.map(mapPlaybookListItem);
}

export async function getPlaybook(
  organizationId: string,
  playbookId: string
): Promise<PlaybookDetail | null> {
  const playbook = await prisma.incidentPlaybook.findFirst({
    where: {
      id: playbookId,
      OR: [{ organizationId: null, isSystemTemplate: true }, { organizationId }],
    },
    include: {
      steps: { orderBy: { order: "asc" } },
    },
  });
  if (!playbook) return null;

  return {
    id: playbook.id,
    name: playbook.name,
    description: playbook.description,
    category: playbook.category,
    severity: playbook.severity,
    isActive: playbook.isActive,
    isSystemTemplate: playbook.isSystemTemplate,
    organizationId: playbook.organizationId,
    stepCount: playbook.steps.length,
    steps: playbook.steps.map((s) => ({
      id: s.id,
      order: s.order,
      phase: s.phase,
      title: s.title,
      description: s.description,
      isRequired: s.isRequired,
      defaultPriority: s.defaultPriority,
    })),
  };
}

export async function suggestPlaybook(
  organizationId: string,
  incidentId: string
): Promise<PlaybookSuggestion | null> {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: { category: true, severity: true },
  });
  if (!incident) throw new Error("Incident not found");

  const playbooks = await listPlaybooks(organizationId);
  if (playbooks.length === 0) return null;

  const categoryMatch = playbooks.find((p) => p.category === incident.category);
  if (categoryMatch) {
    return {
      playbookId: categoryMatch.id,
      name: categoryMatch.name,
      playbookName: categoryMatch.name,
      reason: `Matches incident category ${incident.category}`,
      label: "Suggested",
    };
  }

  const severityMatch = playbooks.find(
    (p) => p.severity === incident.severity && p.isSystemTemplate
  );
  if (severityMatch) {
    return {
      playbookId: severityMatch.id,
      name: severityMatch.name,
      playbookName: severityMatch.name,
      reason: `Closest severity match (${incident.severity})`,
      label: "Suggested",
    };
  }

  const generic = playbooks.find((p) => p.id === "syspb_generic_security");
  const fallback = generic ?? playbooks[0];
  return {
    playbookId: fallback.id,
    name: fallback.name,
    playbookName: fallback.name,
    reason: "Default generic response playbook",
    label: "Suggested",
  };
}

export async function assignPlaybookToIncident(input: {
  organizationId: string;
  actorId: string;
  incidentId: string;
  playbookId: string;
}): Promise<{ instanceId: string; taskCount: number }> {
  const { organizationId, actorId, incidentId, playbookId } = input;

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: { id: true },
  });
  if (!incident) throw new Error("Incident not found");

  const playbook = await prisma.incidentPlaybook.findFirst({
    where: {
      id: playbookId,
      isActive: true,
      OR: [{ organizationId: null, isSystemTemplate: true }, { organizationId }],
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!playbook) throw new Error("Playbook not found");
  if (playbook.steps.length === 0) {
    throw new Error("Playbook has no steps to assign");
  }

  const playbookName =
    sanitizeIncidentText(playbook.name, 300) ?? playbook.name;

  const result = await prisma.$transaction(async (tx) => {
    const instance = await tx.incidentPlaybookInstance.create({
      data: {
        organizationId,
        incidentId,
        sourcePlaybookId: playbook.id,
        playbookName,
        assignedByUserId: actorId,
      },
    });

    const taskData: Prisma.IncidentResponseTaskCreateManyInput[] =
      playbook.steps.map((step) => ({
        organizationId,
        incidentId,
        playbookInstanceId: instance.id,
        phase: step.phase,
        title: sanitizeIncidentText(step.title, 300) ?? step.title,
        description: sanitizeIncidentText(step.description),
        priority: step.defaultPriority,
        status: "TODO",
        isRequired: step.isRequired,
        createdByUserId: actorId,
      }));

    await tx.incidentResponseTask.createMany({ data: taskData });

    await appendIncidentActivity({
      organizationId,
      incidentId,
      actorUserId: actorId,
      activityType: "PLAYBOOK_ASSIGNED",
      message: `Playbook assigned: ${playbookName}`,
      metadata: {
        playbookId: playbook.id,
        instanceId: instance.id,
        taskCount: taskData.length,
      },
      tx,
    });

    return { instanceId: instance.id, taskCount: taskData.length };
  });

  await createAuditLog({
    organizationId,
    actorId,
    action: "INCIDENT_PLAYBOOK_ASSIGNED",
    resourceType: "Incident",
    resourceId: incidentId,
    metadata: {
      playbookId,
      instanceId: result.instanceId,
      taskCount: result.taskCount,
    },
  });

  return result;
}

export async function listPlaybookInstances(
  organizationId: string,
  incidentId: string
) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    select: { id: true },
  });
  if (!incident) throw new Error("Incident not found");

  return prisma.incidentPlaybookInstance.findMany({
    where: { organizationId, incidentId },
    orderBy: { assignedAt: "desc" },
    include: {
      assignedBy: { select: { name: true, email: true } },
      sourcePlaybook: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
  });
}
