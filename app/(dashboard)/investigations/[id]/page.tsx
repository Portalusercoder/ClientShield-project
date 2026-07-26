import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvestigationDetailView } from "@/components/investigations/investigation-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { listOrgUsers } from "@/services/findings.service";
import {
  buildFindingDescriptionSuggestion,
  buildFindingTitleSuggestion,
  listInvestigationFindings,
  searchLinkableFindings,
} from "@/services/investigations/investigation-finding.service";
import {
  aggregateMitre,
  getInvestigationById,
  getInvestigationObservables,
} from "@/services/investigations/investigation.service";
import {
  loadQualityMetricsForGroup,
} from "@/services/investigations/investigation-quality.service";
import { isSafeForExternalLookup } from "@/services/investigations/threat-intel.service";
import type { InvestigationDetailViewModel } from "@/types/investigations";

export const dynamic = "force-dynamic";

interface InvestigationDetailPageProps {
  params: Promise<{ id: string }>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export async function generateMetadata({
  params,
}: InvestigationDetailPageProps): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const group = await getInvestigationById(session.organizationId, id);
  return {
    title: group ? group.title : "Investigation",
  };
}

export default async function InvestigationDetailPage({
  params,
}: InvestigationDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const [group, obsData, linkableIncidents, orgUsers] = await Promise.all([
    getInvestigationById(session.organizationId, id),
    getInvestigationObservables(session.organizationId, id),
    prisma.incident.findMany({
      where: {
        organizationId: session.organizationId,
        status: { notIn: ["CLOSED", "RESOLVED"] },
      },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        severity: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    listOrgUsers(session.organizationId),
  ]);

  if (!group) notFound();

  const [findingsLive, linkableFindingsLive, orgAssets] = await Promise.all([
    listInvestigationFindings(session.organizationId, group.id),
    searchLinkableFindings({
      organizationId: session.organizationId,
      groupId: group.id,
      take: 40,
    }),
    prisma.asset.findMany({
      where: {
        organizationId: session.organizationId,
        ...(group.clientId ? { clientId: group.clientId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  const qualityMetrics = await loadQualityMetricsForGroup(
    session.organizationId,
    group.id
  );

  const storedTactics = asStringArray(group.mitreTactics);
  const storedTechniques = asStringArray(group.mitreTechniques);
  const aggregated =
    storedTactics.length === 0 && storedTechniques.length === 0
      ? aggregateMitre(group.events.map((e) => e.securityEvent))
      : { tactics: storedTactics, techniques: storedTechniques };

  const threatIntelEnabled = Boolean(serverEnv.THREAT_INTEL_ENABLED);
  const threatIntelConfigured = Boolean(
    serverEnv.THREAT_INTEL_ENABLED && serverEnv.THREAT_INTEL_PROVIDER?.trim()
  );

  const explanation = group.groupingExplanation ?? "";
  const strongSignals = explanation
    .split(/Strong signals:\s*/i)[1]
    ?.split(/Supporting:|;/)[0]
    ?.split(";")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  const supportingSignals =
    explanation
      .split(/Supporting:\s*/i)[1]
      ?.split(";")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const view: InvestigationDetailViewModel = {
    id: group.id,
    title: group.title,
    summary: group.summary,
    status: group.status,
    severity: group.severity,
    createdByType: group.createdByType,
    groupingExplanation: group.groupingExplanation,
    confidence: group.confidence,
    qualityWarning: group.qualityWarning,
    qualityMetrics,
    strongSignals,
    supportingSignals,
    mitreTactics: aggregated.tactics,
    mitreTechniques: aggregated.techniques,
    confirmedAt: group.confirmedAt,
    dismissedAt: group.dismissedAt,
    dismissReason: group.dismissReason,
    assignedToUserId: group.assignedToUserId,
    assignedAt: group.assignedAt,
    assignedTo: group.assignedTo
      ? {
          id: group.assignedTo.id,
          name: group.assignedTo.name,
          email: group.assignedTo.email,
        }
      : null,
    resolutionSummary: group.resolutionSummary,
    closedAt: group.closedAt,
    closedBy: group.closedBy
      ? {
          id: group.closedBy.id,
          name: group.closedBy.name,
          email: group.closedBy.email,
        }
      : null,
    reopenedAt: group.reopenedAt,
    reopenedBy: group.reopenedBy
      ? {
          id: group.reopenedBy.id,
          name: group.reopenedBy.name,
          email: group.reopenedBy.email,
        }
      : null,
    lastReopenReason: group.lastReopenReason,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    eventCount: group.events.length,
    observableCount: obsData.observables.length,
    incidentCount: group.incidents.length,
    events: group.events.map((link) => ({
      linkId: link.id,
      securityEventId: link.securityEvent.id,
      title: link.securityEvent.title,
      severity: link.securityEvent.severity,
      status: link.securityEvent.status,
      agentName: link.securityEvent.agentName,
      firstSeenAt: link.securityEvent.firstSeenAt,
      lastSeenAt: link.securityEvent.lastSeenAt,
      addedAt: link.addedAt,
    })),
    observables: obsData.observables.map((o) => {
      const safety = isSafeForExternalLookup(o);
      return {
        id: o.id,
        type: o.type,
        value: o.value,
        normalizedValue: o.normalizedValue,
        firstSeenAt: o.firstSeenAt,
        lastSeenAt: o.lastSeenAt,
        roles: o.roles,
        safeForExternalLookup: safety.safe,
        unsafeReason: safety.reason,
      };
    }),
    threatIntelLookups: obsData.lookups.map((l) => ({
      id: l.id,
      observableId: l.observableId,
      provider: l.provider,
      status: l.status,
      riskLevel: l.riskLevel,
      confidence: l.confidence,
      summary: l.summary,
      lookedUpAt: l.lookedUpAt,
      expiresAt: l.expiresAt,
    })),
    incidents: group.incidents.map((link) => ({
      linkId: link.id,
      incidentId: link.incident.id,
      caseNumber: link.incident.caseNumber,
      title: link.incident.title,
      status: link.incident.status,
      severity: link.incident.severity,
    })),
    findings: findingsLive.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      status: f.status,
      source: f.source,
      assetName: f.asset.name,
      assignedToName: f.assignedTo?.name ?? f.assignedTo?.email ?? null,
      linkedAt: f.investigationLinkedAt,
    })),
    linkableFindings: linkableFindingsLive.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      status: f.status,
      source: f.source,
      assetName: f.asset.name,
      alreadyLinkedElsewhere: Boolean(f.investigationGroupId),
    })),
    findingCreateDefaults: {
      title: buildFindingTitleSuggestion(group.title),
      description: buildFindingDescriptionSuggestion({
        investigationSummary: group.summary,
        groupingExplanation: group.groupingExplanation,
        securityEventTitles: group.events.map((e) => e.securityEvent.title),
      }),
      severity: group.severity,
      assetId:
        group.assetId ??
        group.events.find((e) => e.securityEvent.assetId)?.securityEvent
          .assetId ??
        orgAssets[0]?.id ??
        null,
      assignedToUserId: group.assignedToUserId,
    },
    orgAssets,
    activities: group.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      message: a.message,
      note: a.note,
      createdAt: a.createdAt,
      actorUserId: a.actorUserId,
      actorName: a.actor?.name ?? null,
      actorEmail: a.actor?.email ?? null,
      metadata: a.metadata,
    })),
    notes: group.notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      editedAt: n.editedAt,
      authorUserId: n.authorUserId,
      authorName: n.author.name,
      authorEmail: n.author.email,
    })),
    orgUsers: orgUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
    })),
    candidates: group.correlationCandidates.map((c) => ({
      id: c.id,
      eventAId: c.eventAId,
      eventBId: c.eventBId,
      score: c.score,
      confidence: c.confidence,
      reasons: asStringArray(c.reasons),
      signalFamilies: asStringArray(c.signalFamilies),
      qualityFactors: asStringArray(c.qualityFactors),
      status: c.status,
    })),
    linkableIncidents,
    threatIntelEnabled,
    threatIntelConfigured,
  };

  return (
    <InvestigationDetailView
      investigation={view}
      canAct={hasMinimumRole(session, "ANALYST")}
    />
  );
}
