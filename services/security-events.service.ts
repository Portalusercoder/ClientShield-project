/**
 * Security events service barrel — re-exports the public API from the split
 * `services/security-events/*` modules. Keep this file's exports stable;
 * consumers import from `@/services/security-events.service`.
 */
export {
  getSecurityEventSummaryCounts,
  listSecurityEvents,
  getSecurityEventDetail,
  listSecurityEventsForClient,
  listSecurityEventsForAsset,
  listSecurityEventsForIncident,
  getSecurityEventSocMetrics,
  getRecentSecurityEvents,
  getWazuhIntegrationStatus,
} from "@/services/security-events/queries";
export {
  startSecurityEventReview,
  acknowledgeSecurityEvent,
  dismissSecurityEvent,
} from "@/services/security-events/lifecycle";
export {
  escalateSecurityEventToIncident,
  linkSecurityEventToIncident,
  unlinkSecurityEventFromIncident,
} from "@/services/security-events/incident-bridge";
