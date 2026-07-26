/**
 * Security hardening public API (Phase 6P3).
 */
export {
  getSecurityConfig,
  getSecurityConfigSummary,
  resetSecurityConfigCache,
} from "./config";
export {
  buildContentSecurityPolicy,
  getCspHeaderName,
} from "./csp";
export { applySecurityHeaders } from "./headers";
export {
  assertRateLimit,
  classifyPathBucket,
  RateLimitError,
} from "./enforce-rate-limit";
export {
  buildRateLimitKey,
  checkRateLimit,
  resetRateLimitStore,
} from "./rate-limit";
export type { RateLimitBucket, RateLimitResult } from "./rate-limit";
export {
  DESTRUCTIVE_CONFIRM,
  assertDestructiveConfirmation,
  destructiveConfirmSchema,
  refuseOrganizationHardDelete,
} from "./destructive";
export { logSecurityEvent, logSecurityEventEdge } from "./security-log";
export type { SecurityEventType } from "./security-log";
export { extractClientIp } from "./client-ip";
export {
  entityIdSchema,
  entityIdObjectSchema,
  safeFilenameSchema,
  safeHttpUrlSchema,
  boundedString,
  optionalBoundedString,
} from "./validation";
export { guardAuthenticatedAction } from "./action-guard";
