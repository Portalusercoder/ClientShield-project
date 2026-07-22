import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import {
  applyContentMargins,
  drawBanner,
  drawTableHeader,
  drawTableRow,
  ensureSpace,
  fmtDateTime,
  sectionHeading,
  setCursor,
  type TableColumn,
} from "@/services/reports/pdf/primitives";
import { PDF, contentWidth } from "@/services/reports/pdf/theme";
import { statusToPhaseLabel } from "@/types/incident-case";

/**
 * On-demand Incident Case PDF.
 * Includes metadata, timeline summary, linked SE/findings titles,
 * playbook progress, tasks, and response summaries.
 * Never includes raw Wazuh JSON, passwords, or tokens.
 */
export async function generateIncidentCasePdf(input: {
  organizationId: string;
  incidentId: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const incident = await prisma.incident.findFirst({
    where: {
      id: input.incidentId,
      organizationId: input.organizationId,
    },
    include: {
      client: { select: { name: true } },
      asset: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
      leadAnalyst: { select: { name: true, email: true } },
      commander: { select: { name: true, email: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { actor: { select: { name: true, email: true } } },
      },
      findings: {
        include: {
          finding: { select: { title: true, severity: true, status: true } },
        },
      },
      securityEvents: {
        include: {
          securityEvent: {
            select: { title: true, severity: true, status: true, ruleId: true },
          },
        },
      },
      playbookInstances: {
        orderBy: { assignedAt: "desc" },
        include: { _count: { select: { tasks: true } } },
      },
      responseTasks: {
        orderBy: [{ phase: "asc" }, { createdAt: "asc" }],
        include: {
          assignedTo: { select: { name: true, email: true } },
        },
      },
      evidence: {
        orderBy: { collectedAt: "desc" },
        take: 50,
        select: {
          type: true,
          title: true,
          collectedAt: true,
          sourceType: true,
        },
      },
    },
  });

  if (!incident) {
    throw new Error("Incident not found");
  }

  const filename = `${incident.caseNumber.replace(/[^A-Za-z0-9_-]/g, "_")}-case.pdf`;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PDF.page.marginTop,
        bottom: PDF.page.marginBottom,
        left: PDF.page.marginLeft,
        right: PDF.page.marginRight,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `${incident.caseNumber} — ${incident.title}`,
        Author: "ClientShield Security Operations",
        Subject: "Incident Case Report",
        Keywords: "ClientShield, incident, case, confidential",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    applyContentMargins(doc);
    doc.y = PDF.page.marginTop;

    // Header
    doc
      .fontSize(PDF.type.caption)
      .fillColor(PDF.color.inkFaint)
      .text("CLIENTSHIELD · INCIDENT CASE REPORT", {
        width: contentWidth(doc),
      });
    doc.moveDown(0.4);
    doc
      .fontSize(18)
      .fillColor(PDF.color.navy)
      .text(incident.caseNumber, { width: contentWidth(doc) });
    doc
      .fontSize(12)
      .fillColor(PDF.color.ink)
      .text(incident.title, { width: contentWidth(doc) });
    doc.moveDown(0.5);
    drawBanner(
      doc,
      `Phase: ${statusToPhaseLabel(incident.status)} · Severity: ${incident.severity} · Status: ${incident.status}`,
      "info"
    );

    sectionHeading(doc, "1", "Case Metadata");
    const metaRows: Array<[string, string]> = [
      ["Client", incident.client.name],
      ["Asset", incident.asset?.name ?? "—"],
      ["Category", incident.category.replaceAll("_", " ")],
      ["Source", incident.source.replaceAll("_", " ")],
      [
        "Lead Analyst",
        incident.leadAnalyst?.name ??
          incident.leadAnalyst?.email ??
          "Unassigned",
      ],
      [
        "Commander",
        incident.commander?.name ??
          incident.commander?.email ??
          "Unassigned",
      ],
      [
        "Assignee",
        incident.assignedTo?.name ??
          incident.assignedTo?.email ??
          "Unassigned",
      ],
      ["Detected", fmtDateTime(incident.detectedAt.toISOString())],
      [
        "Acknowledged",
        incident.acknowledgedAt
          ? fmtDateTime(incident.acknowledgedAt.toISOString())
          : "—",
      ],
      [
        "Contained",
        incident.containedAt
          ? fmtDateTime(incident.containedAt.toISOString())
          : "—",
      ],
      [
        "Resolved",
        incident.resolvedAt
          ? fmtDateTime(incident.resolvedAt.toISOString())
          : "—",
      ],
    ];
    for (const [label, value] of metaRows) {
      ensureSpace(doc, 16);
      const y = doc.y;
      doc
        .fontSize(8)
        .fillColor(PDF.color.inkFaint)
        .text(label.toUpperCase(), PDF.page.marginLeft, y, {
          width: 120,
          lineBreak: false,
        });
      doc
        .fontSize(9)
        .fillColor(PDF.color.ink)
        .text(value, PDF.page.marginLeft + 130, y, {
          width: contentWidth(doc) - 130,
        });
      setCursor(doc, Math.max(doc.y, y + 14));
    }

    if (incident.description) {
      ensureSpace(doc, 40);
      doc.moveDown(0.3);
      doc
        .fontSize(8)
        .fillColor(PDF.color.inkFaint)
        .text("DESCRIPTION");
      doc
        .fontSize(9)
        .fillColor(PDF.color.ink)
        .text(incident.description.slice(0, 1500), {
          width: contentWidth(doc),
        });
    }

    sectionHeading(doc, "2", "Timeline Summary");
    if (incident.activities.length === 0) {
      doc.fontSize(9).fillColor(PDF.color.inkMuted).text("No activity recorded.");
    } else {
      for (const a of incident.activities) {
        ensureSpace(doc, 28);
        const actor =
          a.actor?.name ?? a.actor?.email ?? "System";
        doc
          .fontSize(8)
          .fillColor(PDF.color.inkFaint)
          .text(
            `${fmtDateTime(a.createdAt.toISOString())} · ${a.activityType.replaceAll("_", " ")} · ${actor}`
          );
        doc
          .fontSize(9)
          .fillColor(PDF.color.ink)
          .text(a.message.slice(0, 400), { width: contentWidth(doc) });
        doc.moveDown(0.25);
      }
    }

    sectionHeading(doc, "3", "Linked Security Events");
    if (incident.securityEvents.length === 0) {
      doc.fontSize(9).fillColor(PDF.color.inkMuted).text("None linked.");
    } else {
      const cols: TableColumn[] = [
        { key: "title", label: "Title", width: 260 },
        { key: "severity", label: "Severity", width: 70 },
        { key: "status", label: "Status", width: 80 },
        { key: "rule", label: "Rule", width: 90 },
      ];
      let y = doc.y;
      y += drawTableHeader(doc, cols, PDF.page.marginLeft, y);
      incident.securityEvents.forEach((link, i) => {
        ensureSpace(doc, 22);
        y = doc.y;
        y += drawTableRow(
          doc,
          cols,
          {
            title: link.securityEvent.title.slice(0, 80),
            severity: link.securityEvent.severity,
            status: link.securityEvent.status,
            rule: link.securityEvent.ruleId ?? "—",
          },
          PDF.page.marginLeft,
          y,
          i % 2 === 1,
          { severityKey: "severity" }
        );
        setCursor(doc, y);
      });
    }

    sectionHeading(doc, "4", "Linked Findings");
    if (incident.findings.length === 0) {
      doc.fontSize(9).fillColor(PDF.color.inkMuted).text("None linked.");
    } else {
      const cols: TableColumn[] = [
        { key: "title", label: "Title", width: 300 },
        { key: "severity", label: "Severity", width: 80 },
        { key: "status", label: "Status", width: 120 },
      ];
      let y = doc.y;
      y += drawTableHeader(doc, cols, PDF.page.marginLeft, y);
      incident.findings.forEach((link, i) => {
        ensureSpace(doc, 22);
        y = doc.y;
        y += drawTableRow(
          doc,
          cols,
          {
            title: link.finding.title.slice(0, 90),
            severity: link.finding.severity,
            status: link.finding.status,
          },
          PDF.page.marginLeft,
          y,
          i % 2 === 1,
          { severityKey: "severity" }
        );
        setCursor(doc, y);
      });
    }

    sectionHeading(doc, "5", "Playbook Progress");
    if (incident.playbookInstances.length === 0) {
      doc
        .fontSize(9)
        .fillColor(PDF.color.inkMuted)
        .text("No playbook assigned.");
    } else {
      for (const inst of incident.playbookInstances) {
        ensureSpace(doc, 24);
        const done = incident.responseTasks.filter(
          (t) =>
            t.playbookInstanceId === inst.id &&
            (t.status === "COMPLETED" || t.status === "SKIPPED")
        ).length;
        doc
          .fontSize(10)
          .fillColor(PDF.color.ink)
          .text(
            `${inst.playbookName} — ${done}/${inst._count.tasks} tasks complete (snapshot assigned ${fmtDateTime(inst.assignedAt.toISOString())})`
          );
      }
    }

    sectionHeading(doc, "6", "Response Tasks");
    if (incident.responseTasks.length === 0) {
      doc.fontSize(9).fillColor(PDF.color.inkMuted).text("No tasks.");
    } else {
      const cols: TableColumn[] = [
        { key: "phase", label: "Phase", width: 90 },
        { key: "title", label: "Task", width: 220 },
        { key: "status", label: "Status", width: 80 },
        { key: "priority", label: "Priority", width: 60 },
        { key: "assignee", label: "Assignee", width: 90 },
      ];
      let y = doc.y;
      y += drawTableHeader(doc, cols, PDF.page.marginLeft, y);
      incident.responseTasks.forEach((t, i) => {
        ensureSpace(doc, 22);
        y = doc.y;
        y += drawTableRow(
          doc,
          cols,
          {
            phase: t.phase,
            title: t.title.slice(0, 60),
            status: t.status,
            priority: t.priority,
            assignee: t.assignedTo?.name ?? t.assignedTo?.email ?? "—",
          },
          PDF.page.marginLeft,
          y,
          i % 2 === 1
        );
        setCursor(doc, y);
      });
    }

    sectionHeading(doc, "7", "Evidence Index");
    if (incident.evidence.length === 0) {
      doc.fontSize(9).fillColor(PDF.color.inkMuted).text("No evidence logged.");
    } else {
      for (const e of incident.evidence) {
        ensureSpace(doc, 18);
        doc
          .fontSize(9)
          .fillColor(PDF.color.ink)
          .text(
            `[${e.type}] ${e.title} · ${fmtDateTime(e.collectedAt.toISOString())}`,
            { width: contentWidth(doc) }
          );
      }
    }

    sectionHeading(doc, "8", "Response Documentation");
    const responseFields: Array<[string, string | null]> = [
      ["Root Cause", incident.rootCause],
      ["Containment", incident.containmentSummary],
      ["Eradication", incident.eradicationSummary],
      ["Recovery", incident.recoverySummary],
      ["Resolution", incident.resolutionSummary],
      ["Lessons Learned", incident.lessonsLearned],
      ["What Went Well", incident.whatWentWell],
      ["What Could Improve", incident.whatCouldImprove],
      ["Follow-up Actions", incident.followUpActions],
    ];
    for (const [label, value] of responseFields) {
      ensureSpace(doc, 36);
      doc.fontSize(8).fillColor(PDF.color.inkFaint).text(label.toUpperCase());
      doc
        .fontSize(9)
        .fillColor(PDF.color.ink)
        .text((value || "Not documented.").slice(0, 2000), {
          width: contentWidth(doc),
        });
      doc.moveDown(0.35);
    }

    drawBanner(
      doc,
      "Confidential — ClientShield incident case export. Raw detection payloads and secrets are excluded.",
      "neutral"
    );

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNo = i - range.start + 1;
      doc
        .fontSize(7)
        .fillColor(PDF.color.inkFaint)
        .text(
          `${incident.caseNumber} · Page ${pageNo} of ${range.count}`,
          PDF.page.marginLeft,
          doc.page.height - PDF.page.marginBottom + 8,
          { width: contentWidth(doc), align: "center", lineBreak: false }
        );
    }

    doc.end();
  });

  return { buffer, filename };
}
