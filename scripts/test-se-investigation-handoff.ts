/**
 * Phase 6b1 — SE ↔ Investigation handoff tests (DB).
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  createInvestigationFromSecurityEvent,
  getSecurityEventInvestigationHandoff,
  linkSecurityEventToInvestigation,
} from "../services/investigations/se-investigation-handoff.service";

const prisma = new PrismaClient();

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

async function main() {
  const suffix = Date.now().toString(36);
  const org = await prisma.organization.create({
    data: {
      name: `Handoff Org ${suffix}`,
      slug: `handoff-${suffix}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `analyst-${suffix}@test.local`,
      name: "Handoff Analyst",
      role: "ANALYST",
    },
  });
  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      name: `Client ${suffix}`,
      slug: `client-${suffix}`,
      status: "ACTIVE",
    },
  });
  const event = await prisma.securityEvent.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      source: "WAZUH",
      title: `SE handoff ${suffix}`,
      severity: "HIGH",
      status: "NEW",
      classification: "ACTIONABLE",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
      correlationKey: `handoff-${suffix}`,
    },
  });

  section("Handoff NONE state");
  let handoff = await getSecurityEventInvestigationHandoff(org.id, event.id);
  assert.ok(handoff);
  assert.equal(handoff!.panelState, "NONE");
  assert.equal(handoff!.linked.length, 0);
  assert.match(handoff!.createDefaults.title, /Investigation:/);
  console.log("OK none state");

  section("Create from SE");
  const created = await createInvestigationFromSecurityEvent({
    organizationId: org.id,
    actorId: user.id,
    securityEventId: event.id,
    inheritOwner: false,
  });
  assert.ok(created.investigationId);
  handoff = await getSecurityEventInvestigationHandoff(org.id, event.id);
  assert.equal(handoff!.panelState, "LINKED");
  assert.equal(handoff!.linked.length, 1);
  assert.equal(handoff!.linked[0]!.id, created.investigationId);

  const activity = await prisma.securityEventActivity.findFirst({
    where: {
      securityEventId: event.id,
      activityType: "INVESTIGATION_CREATED",
    },
  });
  assert.ok(activity);
  console.log("OK create + activity");

  section("Duplicate link blocked");
  let blocked = false;
  try {
    await linkSecurityEventToInvestigation({
      organizationId: org.id,
      actorId: user.id,
      securityEventId: event.id,
      investigationId: created.investigationId,
    });
  } catch (e) {
    blocked = e instanceof Error && /already linked/i.test(e.message);
  }
  assert.equal(blocked, true);
  console.log("OK duplicate link blocked");

  section("Cross-org blocked");
  const otherOrg = await prisma.organization.create({
    data: { name: `Other ${suffix}`, slug: `other-${suffix}` },
  });
  let crossBlocked = false;
  try {
    await createInvestigationFromSecurityEvent({
      organizationId: otherOrg.id,
      actorId: user.id,
      securityEventId: event.id,
    });
  } catch {
    crossBlocked = true;
  }
  assert.equal(crossBlocked, true);
  console.log("OK cross-org create blocked");

  section("Closed investigation link blocked");
  const closed = await prisma.investigationGroup.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      title: `Closed ${suffix}`,
      status: "DISMISSED",
      severity: "MEDIUM",
      createdByType: "ANALYST_CREATED",
      createdByUserId: user.id,
      dismissReason: "test",
      dismissedAt: new Date(),
    },
  });
  let closedBlocked = false;
  try {
    await linkSecurityEventToInvestigation({
      organizationId: org.id,
      actorId: user.id,
      securityEventId: event.id,
      investigationId: closed.id,
    });
  } catch (e) {
    closedBlocked =
      e instanceof Error && /dismissed or closed/i.test(e.message);
  }
  assert.equal(closedBlocked, true);
  console.log("OK closed link blocked");

  // Cleanup
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => {});
  console.log("\nAll SE investigation handoff tests passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
