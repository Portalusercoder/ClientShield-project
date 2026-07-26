/**
 * Phase 6b5 — workflow navigation helpers (unit-style, no DB).
 * Run: npm run test:workflow-navigation
 */
import {
  buildWorkflowStages,
  WORKFLOW_STAGE_ORDER,
} from "../lib/workflow/workflow-context";
import { assertInternalHref } from "../services/notifications/notification.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function main() {
  console.log("\nWorkflow navigation (Phase 6b5)\n");

  assert(WORKFLOW_STAGE_ORDER.length === 4, "Four workflow stages");

  const seTrail = buildWorkflowStages({
    current: "security-event",
    securityEvent: { id: "se1", title: "SE One" },
    investigation: { id: "inv1", title: "Inv One" },
  });
  assert(seTrail[0].status === "current", "SE is current");
  assert(seTrail[1].status === "available", "Investigation available ahead");
  assert(seTrail[1].href === "/investigations/inv1", "Investigation href");
  assert(seTrail[2].status === "empty", "Finding empty");
  assert(seTrail[3].status === "empty", "Incident empty");

  const findingTrail = buildWorkflowStages({
    current: "finding",
    securityEvent: { id: "se1", title: "SE" },
    investigation: { id: "inv1", title: "Inv" },
    finding: { id: "f1", title: "Finding" },
    incident: { id: "i1", title: "Incident" },
  });
  assert(findingTrail[0].status === "completed", "SE completed behind finding");
  assert(findingTrail[1].status === "completed", "Investigation completed");
  assert(findingTrail[2].status === "current", "Finding current");
  assert(findingTrail[3].status === "available", "Incident available ahead");
  assert(
    findingTrail[0].href === "/security-events/se1",
    "SE deep link preserved"
  );
  assert(
    findingTrail[3].href === "/incidents/i1",
    "Incident deep link preserved"
  );

  // Invalid hrefs blocked (notification deep-link safety)
  try {
    assertInternalHref("https://evil.example");
    assert(false, "External href rejected");
  } catch {
    assert(true, "External href rejected");
  }
  try {
    assertInternalHref("//evil.example");
    assert(false, "Protocol-relative href rejected");
  } catch {
    assert(true, "Protocol-relative href rejected");
  }
  assert(
    assertInternalHref("/investigations/abc") === "/investigations/abc",
    "Internal href accepted"
  );

  // Empty workflow: only current stage present
  const bare = buildWorkflowStages({ current: "investigation" });
  assert(bare.every((s) => s.id !== "investigation" || s.status === "current"), "Bare current");
  assert(bare.filter((s) => s.status === "empty").length === 3, "Others empty");

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
