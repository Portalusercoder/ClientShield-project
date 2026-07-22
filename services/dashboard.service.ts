import type { DashboardData } from "@/types/dashboard";
import {
  MOCK_RECENT_ACTIVITY,
  MOCK_REMEDIATION_METRICS,
  MOCK_SEVERITY_DISTRIBUTION,
} from "@/lib/mock-data/dashboard";
import { countMonitoredAssets } from "@/services/assets.service";
import {
  countClients,
  getClientManagementMetrics,
  getClientsRequiringAttention,
} from "@/services/clients.service";
import {
  countUnresolvedBySeverity,
  getRecentFindings,
} from "@/services/findings.service";
import {
  countOpenIncidents,
  getIncidentCaseMetrics,
  getRecentIncidents,
} from "@/services/incidents.service";
import {
  getRecentSecurityEvents,
  getSecurityEventSocMetrics,
  getSecurityEventSummaryCounts,
} from "@/services/security-events.service";
import { getInvestigationMetrics } from "@/services/investigations/investigation.service";
import { calculateOrganizationSecurityPosture } from "@/services/scoring/organization-security-score.service";

/**
 * Dashboard service layer.
 *
 * Live metrics: clients, monitored assets, critical/high findings,
 * open incidents / case metrics, investigation groups, average security posture,
 * recent findings/incidents, and Security Event SOC metrics
 * (separate from Findings and Cases).
 */
export async function getDashboardData(
  organizationId: string
): Promise<DashboardData> {
  const [
    totalClients,
    assetsMonitored,
    criticalVulnerabilities,
    highVulnerabilities,
    openIncidents,
    caseMetrics,
    investigationMetrics,
    recentFindingsRaw,
    recentIncidents,
    securityEventSummary,
    securityEventSoc,
    recentSecurityEvents,
    posture,
    clientManagement,
    clientsRequiringAttention,
  ] = await Promise.all([
    countClients(organizationId),
    countMonitoredAssets(organizationId),
    countUnresolvedBySeverity(organizationId, "CRITICAL"),
    countUnresolvedBySeverity(organizationId, "HIGH"),
    countOpenIncidents(organizationId),
    getIncidentCaseMetrics(organizationId),
    getInvestigationMetrics(organizationId),
    getRecentFindings(organizationId, 5),
    getRecentIncidents(organizationId, 5),
    getSecurityEventSummaryCounts(organizationId),
    getSecurityEventSocMetrics(organizationId),
    getRecentSecurityEvents(organizationId, 5),
    calculateOrganizationSecurityPosture(organizationId),
    getClientManagementMetrics(organizationId),
    getClientsRequiringAttention(organizationId),
  ]);

  return {
    stats: {
      totalClients,
      assetsMonitored,
      criticalVulnerabilities,
      highVulnerabilities,
      openIncidents,
      newSecurityEvents: securityEventSummary.newEvents,
      criticalSecurityEvents: securityEventSummary.critical,
      highSecurityEvents: securityEventSummary.high,
      unmappedSecurityEvents: securityEventSummary.unmapped,
      securityEventsLast24h: securityEventSoc.last24hTotal,
      actionableSecurityEvents: securityEventSoc.actionable,
      securityEventsUnderReview: securityEventSoc.underReview,
      escalatedSecurityEvents: securityEventSoc.escalated,
      criticalHighSecurityEvents: securityEventSoc.criticalHigh,
      noisyFilteredSecurityEvents: securityEventSoc.noisyOrFiltered,
      averageSecurityScore: posture.averageScore,
      assetsAssessed: posture.assetsAssessed,
      assetsTotal: posture.assetsTotal,
    },
    clientManagement,
    caseMetrics,
    investigationMetrics,
    severityDistribution: MOCK_SEVERITY_DISTRIBUTION,
    securityEventSeverityDistribution: securityEventSoc.severityDistribution,
    topWazuhRules: securityEventSoc.topRules,
    topAffectedAssets: securityEventSoc.topAssets,
    clientsRequiringAttention,
    recentFindings: recentFindingsRaw.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      assetName: f.assetName,
      clientName: f.clientName ?? "—",
      detectedAt: f.lastDetectedAt,
      instanceCount: f.instanceCount,
    })),
    recentIncidents,
    recentSecurityEvents,
    recentActivity: MOCK_RECENT_ACTIVITY,
    remediationMetrics: MOCK_REMEDIATION_METRICS,
  };
}
