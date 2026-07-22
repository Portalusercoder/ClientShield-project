import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvestigationDetailView } from "@/components/investigations/investigation-detail-view";
import { hasMinimumRole, requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  aggregateMitre,
  getInvestigationById,
  getInvestigationObservables,
} from "@/services/investigations/investigation.service";
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

  const [group, obsData, linkableIncidents] = await Promise.all([
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
  ]);

  if (!group) notFound();

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

  const view: InvestigationDetailViewModel = {
    id: group.id,
    title: group.title,
    summary: group.summary,
    status: group.status,
    severity: group.severity,
    createdByType: group.createdByType,
    groupingExplanation: group.groupingExplanation,
    mitreTactics: aggregated.tactics,
    mitreTechniques: aggregated.techniques,
    confirmedAt: group.confirmedAt,
    dismissedAt: group.dismissedAt,
    dismissReason: group.dismissReason,
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
    activities: group.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      message: a.message,
      note: a.note,
      createdAt: a.createdAt,
      actorUserId: a.actorUserId,
    })),
    candidates: group.correlationCandidates.map((c) => ({
      id: c.id,
      eventAId: c.eventAId,
      eventBId: c.eventBId,
      score: c.score,
      confidence: c.confidence,
      reasons: asStringArray(c.reasons),
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
