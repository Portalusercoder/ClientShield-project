/**
 * Phase 6a — Wazuh ingestion integrity unit tests (no Indexer / no DB writes).
 */
import assert from "node:assert/strict";
import {
  buildWazuhAlertsSearchBody,
  isWazuhCheckpointForward,
} from "../lib/wazuh/ingestion-cursor";
import {
  categorizeWazuhIngestionError,
  isRetriableWazuhIngestionError,
  shouldAbortWazuhSyncPageLoop,
} from "../lib/wazuh/ingestion-errors";

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section("Checkpoint forward ordering");
const t1 = new Date("2026-07-26T10:00:00.000Z");
const t2 = new Date("2026-07-26T10:00:01.000Z");
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: t1, documentId: "aaa" },
    { timestamp: t2, documentId: "aaa" }
  ),
  true
);
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: t1, documentId: "bbb" },
    { timestamp: t1, documentId: "ccc" }
  ),
  true,
  "same timestamp later document id is forward"
);
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: t1, documentId: "ccc" },
    { timestamp: t1, documentId: "bbb" }
  ),
  false,
  "same timestamp earlier document id is not forward"
);
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: t1, documentId: "aaa" },
    { timestamp: t1, documentId: "aaa" }
  ),
  false
);
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: t1, documentId: null },
    { timestamp: t1, documentId: "any" }
  ),
  true,
  "null document tip allows same-timestamp advance"
);
assert.equal(
  isWazuhCheckpointForward(
    { timestamp: null, documentId: null },
    { timestamp: t1, documentId: "x" }
  ),
  true
);
console.log("OK checkpoint ordering");

section("search_after body");
const withBoth = buildWazuhAlertsSearchBody({
  afterTimestamp: t1,
  afterDocumentId: "doc-1",
  size: 50,
});
assert.deepEqual(withBoth.search_after, [t1.toISOString(), "doc-1"]);
assert.deepEqual(withBoth.query, { match_all: {} });
assert.equal(
  "bool" in (withBoth.query as object) ? true : false,
  false,
  "search_after path must not use range bool filter"
);

const tsOnly = buildWazuhAlertsSearchBody({
  afterTimestamp: t1,
  afterDocumentId: null,
  size: 50,
});
assert.equal(tsOnly.search_after, undefined);
const must = (tsOnly.query as { bool: { must: unknown[] } }).bool.must;
assert.equal(must.length, 1);
assert.deepEqual(
  (must[0] as { range: { timestamp: { gt: string } } }).range.timestamp,
  { gt: t1.toISOString() }
);

const fromScratch = buildWazuhAlertsSearchBody({ size: 10 });
assert.deepEqual(fromScratch.query, { match_all: {} });
assert.equal(fromScratch.search_after, undefined);
console.log("OK search body");

section("Error categorization");
assert.equal(
  categorizeWazuhIngestionError(new Error("Wazuh Indexer request timed out")),
  "INDEXER_TIMEOUT"
);
assert.equal(
  categorizeWazuhIngestionError(new Error("Wazuh Indexer unreachable: boom")),
  "INDEXER_UNAVAILABLE"
);
assert.equal(
  categorizeWazuhIngestionError(
    new Error("A Wazuh sync is already in progress for this organization")
  ),
  "LOCK_LOST"
);
assert.equal(
  categorizeWazuhIngestionError({ code: "P2002", message: "Unique" }),
  "DUPLICATE"
);
assert.equal(
  categorizeWazuhIngestionError({ code: "P1001", message: "Can't reach" }),
  "TRANSIENT"
);
assert.equal(isRetriableWazuhIngestionError("TRANSIENT"), true);
assert.equal(isRetriableWazuhIngestionError("DUPLICATE"), false);
assert.equal(shouldAbortWazuhSyncPageLoop("INDEXER_UNAVAILABLE"), true);
assert.equal(shouldAbortWazuhSyncPageLoop("DUPLICATE"), false);
assert.equal(shouldAbortWazuhSyncPageLoop("UNKNOWN"), false);
console.log("OK error categories");

console.log("\nAll wazuh ingestion integrity unit tests passed.");
