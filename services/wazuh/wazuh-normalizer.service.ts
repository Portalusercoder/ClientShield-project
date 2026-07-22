import type { SecurityEventSeverity } from "@prisma/client";
import { mapWazuhRuleLevelToSeverity } from "@/lib/wazuh/constants";
import { sanitizeWazuhAlertSource } from "@/services/wazuh/wazuh-sanitizer.service";

export interface NormalizedWazuhAlert {
  documentId: string;
  timestamp: Date;
  ruleId: string | null;
  ruleLevel: number | null;
  ruleDescription: string | null;
  ruleGroups: string[];
  agentId: string | null;
  agentName: string | null;
  agentIp: string | null;
  managerName: string | null;
  decoderName: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  sourcePort: number | null;
  destinationPort: number | null;
  protocol: string | null;
  username: string | null;
  processName: string | null;
  filePath: string | null;
  commandLine: string | null;
  /** Technique/tactic IDs and labels exactly as provided by Wazuh (never invented). */
  mitreTactics: string[];
  mitreTechniques: string[];
  pciDss: string[];
  gdpr: string[];
  hipaa: string[];
  nist: string[];
  severity: SecurityEventSeverity;
  title: string;
  summary: string;
  scaCheckId: string | null;
  rawDataSanitized: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => asString(v))
      .filter((v): v is string => Boolean(v));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function pickIp(data: Record<string, unknown> | null, keys: string[]): string | null {
  if (!data) return null;
  for (const key of keys) {
    const v = asString(data[key]);
    if (v) return v;
  }
  return null;
}

function pickFirstString(
  data: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!data) return null;
  for (const key of keys) {
    const v = asString(data[key]);
    if (v) return v;
  }
  return null;
}

/**
 * Extract MITRE labels/IDs only when present on the Wazuh rule.
 * Prefers explicit `id` arrays for techniques; never invents mappings.
 */
function extractMitre(mitre: Record<string, unknown> | null): {
  tactics: string[];
  techniques: string[];
} {
  if (!mitre) return { tactics: [], techniques: [] };

  const tactics = asStringArray(mitre.tactic ?? mitre.tactics);
  const techniqueIds = asStringArray(mitre.id);
  const techniqueNames = asStringArray(mitre.technique ?? mitre.techniques);

  const techniques: string[] = [];
  if (techniqueIds.length > 0 && techniqueNames.length > 0) {
    const len = Math.max(techniqueIds.length, techniqueNames.length);
    for (let i = 0; i < len; i++) {
      const id = techniqueIds[i];
      const name = techniqueNames[i];
      if (id && name) techniques.push(`${id} — ${name}`);
      else if (id) techniques.push(id);
      else if (name) techniques.push(name);
    }
  } else if (techniqueIds.length > 0) {
    techniques.push(...techniqueIds);
  } else {
    techniques.push(...techniqueNames);
  }

  return { tactics, techniques };
}

/**
 * Normalize a Wazuh Indexer hit into a stable internal structure.
 * Tolerates missing/partial fields.
 */
export function normalizeWazuhAlertHit(hit: {
  _id?: string;
  _source?: Record<string, unknown>;
}): NormalizedWazuhAlert | null {
  const source = hit._source;
  if (!source) return null;

  const documentId = asString(hit._id);
  if (!documentId) return null;

  const rule = asRecord(source.rule);
  const agent = asRecord(source.agent);
  const manager = asRecord(source.manager);
  const decoder = asRecord(source.decoder);
  const data = asRecord(source.data);
  const mitre = asRecord(rule?.mitre);
  const sca = asRecord(source.sca) ?? asRecord(data?.sca);
  const scaCheck = asRecord(sca?.check);
  const win = asRecord(data?.win);
  const winEventdata = asRecord(win?.eventdata);
  const syscheck = asRecord(source.syscheck);

  const timestampRaw =
    asString(source.timestamp) ?? asString(source["@timestamp"]);
  const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();
  if (Number.isNaN(timestamp.getTime())) return null;

  const ruleId = asString(rule?.id);
  const ruleLevel = asNumber(rule?.level);
  const ruleDescription = asString(rule?.description);
  const severity = mapWazuhRuleLevelToSeverity(ruleLevel);

  const scaCheckId =
    asString(scaCheck?.id) ??
    asString(sca?.id) ??
    asString(data?.check_id) ??
    null;

  const title =
    ruleDescription ??
    (ruleId ? `Wazuh rule ${ruleId}` : "Wazuh security alert");

  const agentName = asString(agent?.name);
  const agentId = asString(agent?.id);
  const summaryParts = [
    ruleDescription,
    agentName ? `Agent: ${agentName}` : null,
    ruleId ? `Rule: ${ruleId}` : null,
  ].filter(Boolean);

  const { tactics: mitreTactics, techniques: mitreTechniques } =
    extractMitre(mitre);

  const username = pickFirstString(data, [
    "dstuser",
    "srcuser",
    "user",
    "username",
  ]) ?? pickFirstString(winEventdata, ["targetUserName", "subjectUserName", "user"]);

  const processName =
    pickFirstString(data, ["process", "processName", "image"]) ??
    pickFirstString(winEventdata, ["image", "parentImage"]);

  const filePath =
    pickFirstString(syscheck, ["path"]) ??
    pickFirstString(data, ["file", "path", "filename"]);

  const commandLine =
    pickFirstString(data, ["command", "cmd", "cmdline", "command_line"]) ??
    pickFirstString(winEventdata, ["commandLine"]);

  return {
    documentId,
    timestamp,
    ruleId,
    ruleLevel,
    ruleDescription,
    ruleGroups: asStringArray(rule?.groups),
    agentId,
    agentName,
    agentIp: asString(agent?.ip),
    managerName: asString(manager?.name),
    decoderName: asString(decoder?.name),
    sourceIp:
      pickIp(data, ["srcip", "src_ip", "source_ip"]) ??
      asString(agent?.ip),
    destinationIp: pickIp(data, ["dstip", "dst_ip", "destination_ip"]),
    sourcePort: asNumber(data?.srcport ?? data?.src_port),
    destinationPort: asNumber(data?.dstport ?? data?.dst_port),
    protocol: asString(data?.protocol ?? data?.proto),
    username,
    processName,
    filePath,
    commandLine,
    mitreTactics,
    mitreTechniques,
    pciDss: asStringArray(rule?.pci_dss),
    gdpr: asStringArray(rule?.gdpr),
    hipaa: asStringArray(rule?.hipaa),
    nist: asStringArray(rule?.nist_800_53 ?? rule?.nist),
    severity,
    title,
    summary: summaryParts.join(" · ") || title,
    scaCheckId,
    rawDataSanitized: sanitizeWazuhAlertSource(source),
  };
}
