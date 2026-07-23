/**
 * Trusted installation instruction templates for remote Wazuh agents.
 * NEVER interpolate real secrets into persisted content.
 * Placeholders: <MANAGER_ADDRESS>, <ENROLLMENT_SECRET>, <AGENT_NAME>
 */
import type {
  WazuhEnrollmentArch,
  WazuhEnrollmentPlatform,
} from "@prisma/client";
import type { EnrollmentInstructions } from "@/types/wazuh-enrollment";

const WARNING =
  "Run these commands only on an endpoint you are authorized to monitor.";

const SECRET_TODO =
  "TODO: Secure enrollment secret issuance (Wazuh authd password / enrollment token) is not automated. Obtain the secret from your Wazuh administrator via an approved channel. Never paste secrets into ClientShield forms or audit logs.";

function baseNotes(agentName: string, expectedHostname: string): string[] {
  return [
    `Intended agent name: ${agentName}`,
    `Expected hostname: ${expectedHostname}`,
    "Manager ports 1514/1515 must be reachable only via an approved private network (VPN/Tailscale/WireGuard) — not the public internet.",
    "Indexer (9200), Manager API (55000), and Dashboard (443) must remain unreachable from remote endpoints.",
    SECRET_TODO,
  ];
}

export function buildEnrollmentInstructions(input: {
  platform: WazuhEnrollmentPlatform;
  architecture: WazuhEnrollmentArch;
  agentName: string;
  expectedHostname: string;
}): EnrollmentInstructions {
  const { platform, architecture, agentName, expectedHostname } = input;
  const notes = baseNotes(agentName, expectedHostname);

  if (platform === "MACOS") {
    const archLabel =
      architecture === "ARM64" ? "Apple Silicon (arm64)" : "Intel (x64)";
    return {
      platform,
      architecture,
      title: `macOS ${archLabel} — Wazuh agent install`,
      warning: WARNING,
      steps: [
        "Confirm the Mac is authorized for ClientShield monitoring.",
        "Connect to the approved private overlay (VPN/Tailscale) so <MANAGER_ADDRESS> resolves privately.",
        "Download the official Wazuh agent package matching your architecture from Wazuh documentation.",
        "Install the package, then configure manager address and agent name.",
        "Register using the enrollment secret obtained out-of-band (never stored in ClientShield).",
        "Start the agent and return to ClientShield to Verify Enrollment.",
      ],
      commands: [
        "# Replace placeholders before running. Do not commit secrets.",
        "sudo /Library/Ossec/bin/agent-auth -m <MANAGER_ADDRESS> -P <ENROLLMENT_SECRET>",
        `# Or set agent name explicitly when registering:`,
        "sudo /Library/Ossec/bin/agent-auth -m <MANAGER_ADDRESS> -A <AGENT_NAME> -P <ENROLLMENT_SECRET>",
        "sudo /Library/Ossec/bin/wazuh-control start",
        "sudo /Library/Ossec/bin/wazuh-control status",
      ].map((c) => c.replaceAll("<AGENT_NAME>", agentName)),
      notes,
      secretHandlingTodo: SECRET_TODO,
    };
  }

  if (platform === "WINDOWS") {
    return {
      platform,
      architecture,
      title: "Windows x64 — Wazuh agent install",
      warning: WARNING,
      steps: [
        "Confirm the Windows host is authorized for ClientShield monitoring.",
        "Connect to the approved private overlay before contacting the manager.",
        "Download the official Wazuh Windows agent MSI (x64).",
        "During setup, set Manager address to <MANAGER_ADDRESS> and agent name.",
        "Complete registration with <ENROLLMENT_SECRET> provided out-of-band.",
        "Verify the Wazuh service is running, then Verify Enrollment in ClientShield.",
      ],
      commands: [
        "# PowerShell (Admin). Replace placeholders — never log secrets.",
        "# msiexec /i wazuh-agent-*.msi /q WAZUH_MANAGER='<MANAGER_ADDRESS>' WAZUH_AGENT_NAME='<AGENT_NAME>' WAZUH_REGISTRATION_PASSWORD='<ENROLLMENT_SECRET>'",
        "NET START WazuhSvc",
        "sc query WazuhSvc",
      ].map((c) => c.replaceAll("<AGENT_NAME>", agentName)),
      notes,
      secretHandlingTodo: SECRET_TODO,
    };
  }

  // LINUX
  return {
    platform,
    architecture,
    title: "Linux x64 — Wazuh agent install",
    warning: WARNING,
    steps: [
      "Confirm the Linux host is authorized for ClientShield monitoring.",
      "Connect via approved private overlay before enrollment.",
      "Install the official Wazuh agent package for your distribution (amd64).",
      "Configure /var/ossec/etc/ossec.conf manager address to <MANAGER_ADDRESS>.",
      "Register with agent-auth using <ENROLLMENT_SECRET> from an approved channel.",
      "Start the agent and Verify Enrollment in ClientShield.",
    ],
    commands: [
      "# Replace placeholders. Do not echo or store <ENROLLMENT_SECRET> in shell history if avoidable.",
      "sudo /var/ossec/bin/agent-auth -m <MANAGER_ADDRESS> -A <AGENT_NAME> -P <ENROLLMENT_SECRET>",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable wazuh-agent",
      "sudo systemctl start wazuh-agent",
      "sudo systemctl status wazuh-agent",
    ].map((c) => c.replaceAll("<AGENT_NAME>", agentName)),
    notes,
    secretHandlingTodo: SECRET_TODO,
  };
}
