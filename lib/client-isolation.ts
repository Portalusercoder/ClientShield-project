/**
 * Same-client isolation helpers for linking SecurityEvents, Investigations,
 * Findings, and Incidents within an organization.
 *
 * Org scoping alone is insufficient: records for different clients in the same
 * org must not be linked together.
 */

/** Both sides attributed to different clients → reject. */
export function assertCompatibleClientIds(input: {
  leftClientId: string | null | undefined;
  rightClientId: string | null | undefined;
  context: string;
}): void {
  const left = input.leftClientId ?? null;
  const right = input.rightClientId ?? null;
  if (left && right && left !== right) {
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

/** All non-null client IDs in a set must be identical. */
export function assertUniformClientIds(
  clientIds: Array<string | null | undefined>,
  context: string
): string | null {
  const attributed = [
    ...new Set(clientIds.filter((id): id is string => Boolean(id))),
  ];
  if (attributed.length > 1) {
    throw new Error(`Cross-client linking is not allowed (${context})`);
  }
  return attributed[0] ?? null;
}
