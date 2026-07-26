import { getSecurityKpiAnalytics } from "@/services/analytics/kpi-analytics.service";
import { getIncidentAnalytics } from "@/services/analytics/incident-analytics.service";
import { getInvestigationAnalytics } from "@/services/analytics/investigation-analytics.service";
import { getFindingAnalytics } from "@/services/analytics/finding-analytics.service";
import { getSecurityEventAnalytics } from "@/services/analytics/security-event-analytics.service";
import { getSlaAnalytics } from "@/services/analytics/sla-analytics.service";
import { getRiskAnalytics } from "@/services/analytics/risk-analytics.service";
import { getAnalystAnalytics } from "@/services/analytics/analyst-analytics.service";
import { daysAgo, parseRangeDays } from "@/services/analytics/shared";
import type {
  AnalyticsRangeDays,
  SecurityAnalyticsData,
} from "@/types/analytics";

/**
 * On-demand Security Analytics orchestrator (Phase 6C4).
 * Does not cache or schedule aggregation.
 */
export async function getSecurityAnalytics(input: {
  organizationId: string;
  rangeDays?: AnalyticsRangeDays | string | null;
}): Promise<SecurityAnalyticsData> {
  const rangeDays = parseRangeDays(
    typeof input.rangeDays === "number"
      ? String(input.rangeDays)
      : input.rangeDays
  );
  const rangeEnd = new Date();
  const rangeStart = daysAgo(rangeDays, rangeEnd);

  const [
    kpis,
    incidents,
    investigations,
    findings,
    securityEvents,
    sla,
    risk,
    analysts,
  ] = await Promise.all([
    getSecurityKpiAnalytics({
      organizationId: input.organizationId,
      rangeDays,
    }),
    getIncidentAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getInvestigationAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getFindingAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getSecurityEventAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getSlaAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getRiskAnalytics({
      organizationId: input.organizationId,
      rangeDays,
      rangeStart,
      rangeEnd,
    }),
    getAnalystAnalytics({
      organizationId: input.organizationId,
      rangeStart,
      rangeEnd,
    }),
  ]);

  return {
    organizationId: input.organizationId,
    rangeDays,
    generatedAt: new Date().toISOString(),
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    kpis,
    incidents,
    investigations,
    findings,
    securityEvents,
    sla,
    risk,
    analysts,
  };
}

export { parseRangeDays };
