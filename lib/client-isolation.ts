/**
 * Same-client isolation helpers for linking SecurityEvents, Investigations,
 * Findings, Incidents, and correlation cohorts within an organization.
 *
 * Org scoping alone is insufficient: records for different clients in the same
 * org must not be linked together. Attributed and unattributed (null clientId)
 * events also must not be mixed.
 */

/** Normalize optional client id to null. */
export function normalizeClientId(
  clientId: string | null | undefined
): string | null {
  return clientId ?? null;
}

/**
 * True when both sides are the same non-null client, or both are unattributed.
 * False for different clients or attributed↔null mixes.
 */
export function areSameClientCohort(
  leftClientId: string | null | undefined,
  rightClientId: string | null | undefined
): boolean {
  const left = normalizeClientId(leftClientId);
  const right = normalizeClientId(rightClientId);
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return left === right;
}

/**
 * Cohort key for partitioning (union-find, peer filters).
 * Unattributed events share one null cohort.
 */
export function clientCohortKey(
  clientId: string | null | undefined
): string {
  return normalizeClientId(clientId) ?? "__unattributed__";
}

/**
 * Reject different non-null clients AND attributed↔null mixes.
 * Both null or both the same client → ok.
 */
export function assertCompatibleClientIds(input: {
  leftClientId: string | null | undefined;
  rightClientId: string | null | undefined;
  context: string;
}): void {
  if (
    !areSameClientCohort(input.leftClientId, input.rightClientId)
  ) {
    throw new Error(`Cross-client linking is not allowed (${input.context})`);
  }
}

/**
 * Target (e.g. Incident) always has a client. Source must be attributed to the
 * same client — unattributed sources cannot be linked into a client-scoped case.
 */
export function assertMatchesTargetClient(input: {
  sourceClientId: string | null | undefined;
  targetClientId: string;
  context: string;
}): void {
  if (!input.sourceClientId) {
    throw new Error(
      `Record must be attributed to a client before linking (${input.context})`
    );
  }
  if (input.sourceClientId !== input.targetClientId) {
    throw new Error(`Cross-client linking is not allowed (${input.context})`);
  }
}

/**
 * All client IDs in a set must share one cohort:
 * - all same non-null client → that clientId
 * - all null → null
 * - mix of different clients OR attributed + null → throw
 */
export function assertUniformClientIds(
  clientIds: Array<string | null | undefined>,
  context: string
): string | null {
  if (clientIds.length === 0) return null;

  const normalized = clientIds.map(normalizeClientId);
  const hasNull = normalized.some((id) => id === null);
  const attributed = [
    ...new Set(normalized.filter((id): id is string => id !== null)),
  ];

  if (attributed.length > 1) {
    throw new Error(`Cross-client linking is not allowed (${context})`);
  }
  if (hasNull && attributed.length > 0) {
    throw new Error(`Cross-client linking is not allowed (${context})`);
  }
  return attributed[0] ?? null;
}
