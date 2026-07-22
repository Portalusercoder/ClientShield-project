/**
 * Unit tests for Wazuh sanitization, normalization, severity, and correlation.
 * Does NOT connect to Wazuh. Does NOT ingest alerts.
 */
import assert from "node:assert/strict";
import {
  isWazuhMappableAssetType,
  mapWazuhRuleLevelToSeverity,
} from "../lib/wazuh/constants";
import { classifyWazuhAlert } from "../services/wazuh/wazuh-classification.service";
import {
  buildCorrelationKey,
  buildCorrelationSummary,
  isWithinCorrelationWindow,
} from "../services/wazuh/wazuh-correlation.service";
import { evaluateWazuhIngestionPolicy } from "../services/wazuh/wazuh-ingestion-policy.service";
import { normalizeWazuhAlertHit } from "../services/wazuh/wazuh-normalizer.service";
import {
  sanitizeFreeText,
  sanitizeWazuhAlertSource,
} from "../services/wazuh/wazuh-sanitizer.service";

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section("Severity mapping");
assert.equal(mapWazuhRuleLevelToSeverity(0), "INFO");
assert.equal(mapWazuhRuleLevelToSeverity(3), "INFO");
assert.equal(mapWazuhRuleLevelToSeverity(4), "LOW");
assert.equal(mapWazuhRuleLevelToSeverity(6), "LOW");
assert.equal(mapWazuhRuleLevelToSeverity(7), "MEDIUM");
assert.equal(mapWazuhRuleLevelToSeverity(9), "MEDIUM");
assert.equal(mapWazuhRuleLevelToSeverity(10), "HIGH");
assert.equal(mapWazuhRuleLevelToSeverity(12), "HIGH");
assert.equal(mapWazuhRuleLevelToSeverity(13), "CRITICAL");
assert.equal(mapWazuhRuleLevelToSeverity(15), "CRITICAL");
assert.equal(mapWazuhRuleLevelToSeverity(null), "INFO");
console.log("OK severity mapping");

section("Sanitization");
const sanitized = sanitizeWazuhAlertSource({
  timestamp: "2026-07-21T10:00:00.000Z",
  rule: { id: "5503", level: 5, description: "Login failed" },
  agent: { id: "001", name: "web-01" },
  password: "supersecret",
  data: {
    srcip: "10.0.0.1",
    authorization: "Bearer abc.def",
    token: "xyz",
  },
  full_log: "password=hunter2 user=admin",
});
assert.ok(sanitized);
assert.equal(sanitized!.password, undefined); // allowlist drops forbidden top-level keys
const data = sanitized!.data as Record<string, unknown>;
assert.equal(data.authorization, "[REDACTED]");
assert.equal(data.token, "[REDACTED]");
assert.equal(data.srcip, "10.0.0.1");
assert.match(String(sanitized!.full_log), /\[REDACTED\]/);
assert.equal(
  sanitizeFreeText("Authorization: Bearer tok123"),
  "Authorization: [REDACTED]"
);
console.log("OK sanitization");

section("Normalization");
const normalized = normalizeWazuhAlertHit({
  _id: "abc123",
  _source: {
    timestamp: "2026-07-21T10:00:00.000Z",
    rule: {
      id: "5503",
      level: 10,
      description: "User login failed",
      groups: ["authentication_failed"],
      mitre: { tactic: ["Credential Access"], technique: ["T1110"] },
      pci_dss: ["10.2.4"],
    },
    agent: { id: "001", name: "web-01", ip: "10.0.0.5" },
    data: { srcip: "203.0.113.10", dstip: "10.0.0.5", srcport: 443 },
  },
});
assert.ok(normalized);
assert.equal(normalized!.documentId, "abc123");
assert.equal(normalized!.ruleId, "5503");
assert.equal(normalized!.severity, "HIGH");
assert.equal(normalized!.agentId, "001");
assert.equal(normalized!.sourceIp, "203.0.113.10");
assert.equal(normalized!.destinationIp, "10.0.0.5");
assert.deepEqual(normalized!.mitreTechniques, ["T1110"]);

const mitreRich = normalizeWazuhAlertHit({
  _id: "mitre1",
  _source: {
    timestamp: "2026-07-21T10:00:00.000Z",
    rule: {
      id: "100200",
      level: 12,
      description: "Suspicious powershell",
      mitre: {
        id: ["T1059", "T1059.001"],
        tactic: ["Execution"],
        technique: [
          "Command and Scripting Interpreter",
          "PowerShell",
        ],
      },
    },
    agent: { id: "001", name: "host" },
    data: { srcuser: "bob", command: "powershell -enc AA==" },
  },
});
assert.ok(mitreRich);
assert.deepEqual(mitreRich!.mitreTactics, ["Execution"]);
assert.equal(
  mitreRich!.mitreTechniques[0],
  "T1059 — Command and Scripting Interpreter"
);
assert.equal(mitreRich!.username, "bob");
assert.equal(mitreRich!.commandLine, "powershell -enc AA==");

const noMitre = normalizeWazuhAlertHit({
  _id: "nomitre",
  _source: {
    timestamp: "2026-07-21T10:00:00.000Z",
    rule: { id: "1", level: 3, description: "Heartbeat" },
    agent: { id: "001", name: "host" },
  },
});
assert.ok(noMitre);
assert.deepEqual(noMitre!.mitreTechniques, []);
assert.deepEqual(noMitre!.mitreTactics, []);

const malformed = normalizeWazuhAlertHit({ _source: {} });
assert.equal(malformed, null);
console.log("OK normalization");

section("Correlation");
const key1 = buildCorrelationKey({
  organizationId: "org1",
  assetId: null,
  alert: normalized!,
});
const key2 = buildCorrelationKey({
  organizationId: "org1",
  assetId: null,
  alert: { ...normalized!, agentId: "002" },
});
assert.notEqual(key1, key2);

const t0 = new Date("2026-07-21T10:00:00.000Z");
const t1 = new Date("2026-07-21T10:10:00.000Z");
const t2 = new Date("2026-07-21T10:20:00.000Z");
assert.equal(isWithinCorrelationWindow(t0, t1, 15 * 60 * 1000), true);
assert.equal(isWithinCorrelationWindow(t0, t2, 15 * 60 * 1000), false);

const summary = buildCorrelationSummary({
  organizationId: "org1",
  assetId: null,
  alert: normalized!,
  occurrenceCount: 38,
  windowLabel: "15 minutes",
});
assert.match(summary, /38 Wazuh alerts correlated/);
assert.match(summary, /Rule 5503/);
assert.match(summary, /Agent 001/);
assert.doesNotMatch(summary, /[a-f0-9]{48}/);
console.log("OK correlation");

section("Classification + policy");
assert.equal(classifyWazuhAlert(normalized!), "ACTIONABLE"); // level 10
assert.equal(
  classifyWazuhAlert({
    ...normalized!,
    ruleId: "19008",
    ruleLevel: 3,
    ruleDescription: "CIS_Apple check",
    ruleGroups: ["sca"],
  }),
  "NOISY"
);
assert.equal(
  classifyWazuhAlert({
    ...normalized!,
    ruleId: "89603",
    ruleLevel: 3,
    ruleDescription: "Screen locked",
    ruleGroups: [],
  }),
  "INFORMATIONAL"
);

const scaNorm = normalizeWazuhAlertHit({
  _id: "sca1",
  _source: {
    timestamp: "2026-07-21T10:00:00.000Z",
    rule: { id: "19007", level: 7, description: "CIS check", groups: ["sca"] },
    agent: { id: "001", name: "mac" },
    sca: { check: { id: "xccdf_org.ssgproject.content_rule_sudo" } },
  },
});
assert.ok(scaNorm?.scaCheckId);
const scaKeyA = buildCorrelationKey({
  organizationId: "org1",
  assetId: "asset1",
  alert: scaNorm!,
});
const scaKeyB = buildCorrelationKey({
  organizationId: "org1",
  assetId: "asset1",
  alert: { ...scaNorm!, documentId: "other" },
});
assert.equal(scaKeyA, scaKeyB);

assert.equal(isWazuhMappableAssetType("WORKSTATION"), true);
assert.equal(isWazuhMappableAssetType("WEBSITE"), false);
assert.equal(isWazuhMappableAssetType("SERVER"), true);

const below = evaluateWazuhIngestionPolicy({
  ...normalized!,
  ruleLevel: 2,
  ruleId: "99999",
});
assert.equal(below.action, "FILTER");
if (below.action === "FILTER") {
  assert.equal(below.disposition, "FILTERED_LEVEL");
}
const okLevel = evaluateWazuhIngestionPolicy({
  ...normalized!,
  ruleLevel: 5,
  ruleId: "5503",
});
assert.equal(okLevel.action, "CREATE_EVENT");
console.log("OK classification + policy");

console.log("\nAll wazuh unit tests passed.");
