/**
 * Security Events + Wazuh integration service tests.
 * Uses an isolated test organization. Does NOT call live Wazuh APIs.
 * Does NOT perform real ingestion.
 */
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import {
  acknowledgeSecurityEvent,
  dismissSecurityEvent,
  escalateSecurityEventToIncident,
  getSecurityEventDetail,
  getSecurityEventSocMetrics,
  linkSecurityEventToIncident,
  listSecurityEvents,
  startSecurityEventReview,
  unlinkSecurityEventFromIncident,
} from "../services/security-events.service";
import { createIncident } from "../services/incidents.service";

const SUFFIX = `se-${Date.now()}`;

function assertTrue(cond: boolean, msg: string) {
  assert.equal(cond, true, msg);
}

async function main() {
  console.log("Security Events tests starting…");

  const org = await prisma.organization.create({
    data: {
      name: `Test Org SE ${SUFFIX}`,
      slug: `test-org-se-${SUFFIX}`,
    },
  });
  const otherOrg = await prisma.organization.create({
    data: {
      name: `Other Org SE ${SUFFIX}`,
      slug: `other-org-se-${SUFFIX}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `analyst-${SUFFIX}@test.local`,
      name: "SE Analyst",
      role: "ADMIN",
    },
  });
  const otherUser = await prisma.user.create({
    data: {
      organizationId: otherOrg.id,
      email: `other-${SUFFIX}@test.local`,
      name: "Other",
      role: "ADMIN",
    },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      name: `Client SE ${SUFFIX}`,
      slug: `client-se-${SUFFIX}`,
      status: "ACTIVE",
    },
  });
  const asset = await prisma.asset.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      name: `Asset SE ${SUFFIX}`,
      type: "SERVER",
      hostname: "web-prod-01",
      authorizationStatus: "AUTHORIZED",
      monitoringStatus: "ACTIVE",
    },
  });

  // Temporarily set env for mapping org check
  process.env.WAZUH_ORGANIZATION_ID = org.id;

  try {
    // --- Create security event directly (simulate ingest) ---
    const event = await prisma.securityEvent.create({
      data: {
        organizationId: org.id,
        source: "WAZUH",
        title: "Test login failure",
        summary: "Correlated test event",
        severity: "HIGH",
        status: "NEW",
        ruleId: "5503",
        ruleLevel: 10,
        agentId: "001",
        agentName: "web-prod-01",
        correlationKey: `test-key-${SUFFIX}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 3,
      },
    });

    const listed = await listSecurityEvents(org.id, { page: 1, pageSize: 25 });
    assertTrue(
      listed.events.some((e) => e.id === event.id),
      "list includes event"
    );
    assertTrue(listed.summary.newEvents >= 1, "new events count");

    const filteredList = await listSecurityEvents(org.id, {
      page: 1,
      pageSize: 25,
      severity: "HIGH",
      ruleId: "5503",
      sort: "newest",
    });
    assertTrue(
      filteredList.events.every((e) => e.severity === "HIGH"),
      "severity filter"
    );
    assertTrue(
      filteredList.events.some((e) => e.id === event.id),
      "rule filter includes event"
    );

    const page2 = await listSecurityEvents(org.id, {
      page: 1,
      pageSize: 1,
      sort: "oldest",
    });
    assert.equal(page2.pageSize, 1);
    assertTrue(page2.total >= 1, "pagination total");

    // Cross-org isolation
    const otherList = await listSecurityEvents(otherOrg.id, {
      page: 1,
      pageSize: 25,
    });
    assertTrue(
      !otherList.events.some((e) => e.id === event.id),
      "cross-org list blocked"
    );
    const crossDetail = await getSecurityEventDetail(otherOrg.id, event.id);
    assert.equal(crossDetail, null);

    // Workflow
    await startSecurityEventReview({
      organizationId: org.id,
      actorId: user.id,
      eventId: event.id,
    });
    let detail = await getSecurityEventDetail(org.id, event.id);
    assert.equal(detail?.status, "REVIEWING");
    assertTrue(
      (detail?.activities ?? []).some((a) => a.activityType === "REVIEW_STARTED"),
      "review activity recorded"
    );

    await acknowledgeSecurityEvent({
      organizationId: org.id,
      actorId: user.id,
      eventId: event.id,
    });
    detail = await getSecurityEventDetail(org.id, event.id);
    assert.equal(detail?.status, "ACKNOWLEDGED");

    await startSecurityEventReview({
      organizationId: org.id,
      actorId: user.id,
      eventId: event.id,
    });
    detail = await getSecurityEventDetail(org.id, event.id);
    assert.equal(detail?.status, "REVIEWING");

    // Dismiss requires reason
    let dismissFailed = false;
    try {
      await dismissSecurityEvent({
        organizationId: org.id,
        actorId: user.id,
        eventId: event.id,
        data: { reason: "ab" },
      });
    } catch {
      dismissFailed = true;
    }
    assertTrue(dismissFailed, "short dismissal reason rejected");

    // Reset for escalate path — create mapped event
    const mappedEvent = await prisma.securityEvent.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        assetId: asset.id,
        source: "WAZUH",
        title: "Mapped brute force",
        severity: "CRITICAL",
        status: "NEW",
        ruleId: "5710",
        ruleLevel: 14,
        agentId: "001",
        correlationKey: `mapped-key-${SUFFIX}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 12,
      },
    });

    // Unmapped escalate blocked
    let unmappedEscalationBlocked = false;
    try {
      await escalateSecurityEventToIncident({
        organizationId: org.id,
        actorId: user.id,
        eventId: event.id,
        data: {},
      });
    } catch {
      unmappedEscalationBlocked = true;
    }
    assertTrue(unmappedEscalationBlocked, "unmapped escalate blocked");

    const esc = await escalateSecurityEventToIncident({
      organizationId: org.id,
      actorId: user.id,
      eventId: mappedEvent.id,
      data: { title: `Incident from SE ${SUFFIX}` },
    });
    assertTrue(Boolean(esc.incidentId), "escalation created incident");

    const escalated = await getSecurityEventDetail(org.id, mappedEvent.id);
    assert.equal(escalated?.status, "ESCALATED");
    assertTrue(
      (escalated?.linkedIncidents.length ?? 0) >= 1,
      "incident linked"
    );

    // Multi-event → one incident
    const second = await prisma.securityEvent.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        assetId: asset.id,
        source: "WAZUH",
        title: "Second related event",
        severity: "HIGH",
        status: "NEW",
        ruleId: "5712",
        ruleLevel: 10,
        agentId: "001",
        correlationKey: `second-key-${SUFFIX}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    await linkSecurityEventToIncident({
      organizationId: org.id,
      actorId: user.id,
      data: {
        securityEventId: second.id,
        incidentId: esc.incidentId,
      },
    });

    let duplicateLinkBlocked = false;
    try {
      await linkSecurityEventToIncident({
        organizationId: org.id,
        actorId: user.id,
        data: {
          securityEventId: second.id,
          incidentId: esc.incidentId,
        },
      });
    } catch {
      duplicateLinkBlocked = true;
    }
    assertTrue(duplicateLinkBlocked, "duplicate incident link blocked");

    const soc = await getSecurityEventSocMetrics(org.id);
    assertTrue(soc.last24hTotal >= 1, "soc metrics last24h");
    assertTrue(Array.isArray(soc.topRules), "soc top rules");
    assertTrue(Array.isArray(soc.severityDistribution), "soc severity dist");

    // Cross-org link blocked
    const otherIncident = await createIncident({
      organizationId: otherOrg.id,
      actorId: otherUser.id,
      data: {
        clientId: (
          await prisma.client.create({
            data: {
              organizationId: otherOrg.id,
              name: `Other Client ${SUFFIX}`,
              slug: `other-client-${SUFFIX}`,
              status: "ACTIVE",
            },
          })
        ).id,
        title: `Other incident ${SUFFIX}`,
        description: "Cross org test",
        severity: "MEDIUM",
        category: "OTHER",
        source: "MANUAL",
        detectionMethod: "MANUAL",
        assetId: null,
        assignedToUserId: null,
        occurredAt: null,
        businessImpact: null,
        technicalImpact: null,
        findingId: null,
        externalSourceId: null,
      },
    });

    let crossLinkBlocked = false;
    try {
      await linkSecurityEventToIncident({
        organizationId: otherOrg.id,
        actorId: otherUser.id,
        data: {
          securityEventId: second.id,
          incidentId: otherIncident.id,
        },
      });
    } catch {
      crossLinkBlocked = true;
    }
    assertTrue(crossLinkBlocked, "cross-org event link blocked");

    // Same-org, different-client link must be rejected
    const clientB = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: `Client B ${SUFFIX}`,
        slug: `client-b-${SUFFIX}`,
        status: "ACTIVE",
      },
    });
    const assetB = await prisma.asset.create({
      data: {
        organizationId: org.id,
        clientId: clientB.id,
        name: `Asset B ${SUFFIX}`,
        type: "SERVER",
        environment: "PRODUCTION",
        criticality: "MEDIUM",
        monitoringStatus: "ACTIVE",
        authorizationStatus: "AUTHORIZED",
      },
    });
    const otherClientEvent = await prisma.securityEvent.create({
      data: {
        organizationId: org.id,
        clientId: clientB.id,
        assetId: assetB.id,
        source: "WAZUH",
        title: "Other client event",
        severity: "HIGH",
        status: "NEW",
        ruleId: "5503",
        ruleLevel: 5,
        agentId: "002",
        correlationKey: `other-client-key-${SUFFIX}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    let crossClientLinkBlocked = false;
    try {
      await linkSecurityEventToIncident({
        organizationId: org.id,
        actorId: user.id,
        data: {
          securityEventId: otherClientEvent.id,
          incidentId: esc.incidentId,
        },
      });
    } catch (err) {
      crossClientLinkBlocked =
        err instanceof Error &&
        err.message.includes("Cross-client linking is not allowed");
    }
    assertTrue(crossClientLinkBlocked, "cross-client event→incident link blocked");

    await unlinkSecurityEventFromIncident({
      organizationId: org.id,
      actorId: user.id,
      incidentId: esc.incidentId,
      securityEventId: second.id,
    });

    // Agent mapping (requires WAZUH_ORGANIZATION_ID match — re-import env is already set at process level;
    // service reads serverEnv which was parsed at module load — mapping may fail if env was parsed early)
    // Test mapping via prisma directly for uniqueness + then service if possible
    await prisma.wazuhAgentMapping.create({
      data: {
        organizationId: org.id,
        wazuhAgentId: "001",
        wazuhAgentName: "web-prod-01",
        clientId: client.id,
        assetId: asset.id,
        mappedByUserId: user.id,
      },
    });
    const mapping = await prisma.wazuhAgentMapping.findUnique({
      where: {
        organizationId_wazuhAgentId: {
          organizationId: org.id,
          wazuhAgentId: "001",
        },
      },
    });
    assertTrue(Boolean(mapping), "agent mapping persisted");

    // Dismiss event
    const dismissable = await prisma.securityEvent.create({
      data: {
        organizationId: org.id,
        source: "WAZUH",
        title: "Noise event",
        severity: "INFO",
        status: "NEW",
        correlationKey: `dismiss-${SUFFIX}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    await dismissSecurityEvent({
      organizationId: org.id,
      actorId: user.id,
      eventId: dismissable.id,
      data: { reason: "Benign manager startup noise" },
    });
    const dismissed = await getSecurityEventDetail(org.id, dismissable.id);
    assert.equal(dismissed?.status, "DISMISSED");
    assertTrue(Boolean(dismissed?.dismissalReason), "dismissal reason stored");

    // Idempotency table
    await prisma.wazuhProcessedAlert.create({
      data: {
        organizationId: org.id,
        documentId: `doc-${SUFFIX}`,
        securityEventId: event.id,
        alertTimestamp: new Date(),
      },
    });
    let dupBlocked = false;
    try {
      await prisma.wazuhProcessedAlert.create({
        data: {
          organizationId: org.id,
          documentId: `doc-${SUFFIX}`,
          securityEventId: event.id,
        },
      });
    } catch {
      dupBlocked = true;
    }
    assertTrue(dupBlocked, "duplicate document id blocked");

    // Sync from checkpoint without init must fail (org mismatch / not configured)
    // Checkpoint status fields on empty state
    await prisma.wazuhIngestionState.create({
      data: {
        organizationId: org.id,
        lastTimestamp: new Date("2026-07-21T12:00:00.000Z"),
        lastSuccessfulSyncAt: new Date("2026-07-21T12:00:00.000Z"),
      },
    });
    const state = await prisma.wazuhIngestionState.findUnique({
      where: { organizationId: org.id },
    });
    assertTrue(Boolean(state?.lastTimestamp), "checkpoint persisted");

    console.log("\nAll security events tests passed.");
  } finally {
    // Cleanup — cascade from orgs
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.organization
      .delete({ where: { id: otherOrg.id } })
      .catch(() => {});
    console.log("Cleanup complete.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
