/**
 * Incidents service barrel — re-exports the public API from the split
 * `services/incidents/*` modules. Keep this file's exports stable; consumers
 * import from `@/services/incidents.service`.
 */
export { calculateIncidentSla } from "@/services/incidents/sla";
export {
  getIncidentSummary,
  countOpenIncidents,
  getRecentIncidents,
  listIncidents,
  listIncidentsForClient,
  listIncidentsForAsset,
  getIncidentById,
  searchFindingsForLink,
  getIncidentReportStats,
  getIncidentCaseMetrics,
} from "@/services/incidents/queries";
export {
  createIncident,
  escalateFindingToIncident,
  updateIncidentStatus,
  updateIncidentSeverity,
  assignIncident,
  updateIncidentResponse,
  addIncidentNote,
  linkFindingToIncident,
  unlinkFindingFromIncident,
} from "@/services/incidents/commands";
