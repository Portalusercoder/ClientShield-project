import type {
  DashboardActivity,
  DashboardClientAttention,
  DashboardFinding,
  DashboardRemediationMetric,
  DashboardStats,
  SeverityDistribution,
} from "@/types/dashboard";

/**
 * MOCK DATA — Replace with database queries scoped to organizationId.
 * All dashboard metrics below are placeholders for UI development.
 */

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  totalClients: 24,
  assetsMonitored: 187,
  criticalVulnerabilities: 7,
  highVulnerabilities: 23,
  openIncidents: 4,
  newSecurityEvents: 0,
  criticalSecurityEvents: 0,
  highSecurityEvents: 0,
  unmappedSecurityEvents: 0,
  securityEventsLast24h: 0,
  actionableSecurityEvents: 0,
  securityEventsUnderReview: 0,
  escalatedSecurityEvents: 0,
  criticalHighSecurityEvents: 0,
  noisyFilteredSecurityEvents: 0,
  averageSecurityScore: 78.4,
  assetsAssessed: 120,
  assetsTotal: 187,
};

export const MOCK_SEVERITY_DISTRIBUTION: SeverityDistribution[] = [
  { severity: "CRITICAL", count: 7, color: "bg-severity-critical" },
  { severity: "HIGH", count: 23, color: "bg-severity-high" },
  { severity: "MEDIUM", count: 56, color: "bg-severity-medium" },
  { severity: "LOW", count: 89, color: "bg-severity-low" },
  { severity: "INFO", count: 34, color: "bg-severity-info" },
];

export const MOCK_CLIENTS_REQUIRING_ATTENTION: DashboardClientAttention[] = [
  {
    id: "mock-client-1",
    name: "Acme IoT Solutions",
    securityScore: 52,
    criticalFindings: 3,
    openIncidents: 2,
  },
  {
    id: "mock-client-2",
    name: "Nova Retail Group",
    securityScore: 61,
    criticalFindings: 2,
    openIncidents: 1,
  },
  {
    id: "mock-client-3",
    name: "Helix Manufacturing",
    securityScore: 58,
    criticalFindings: 1,
    openIncidents: 1,
  },
  {
    id: "mock-client-4",
    name: "Pinnacle Finance",
    securityScore: 64,
    criticalFindings: 1,
    openIncidents: 0,
  },
];

export const MOCK_RECENT_FINDINGS: DashboardFinding[] = [
  {
    id: "mock-finding-1",
    title: "TLS 1.0 enabled on production endpoint",
    severity: "CRITICAL",
    assetName: "api.acme-iot.com",
    clientName: "Acme IoT Solutions",
    detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "mock-finding-2",
    title: "Missing Content-Security-Policy header",
    severity: "HIGH",
    assetName: "shop.novaretail.com",
    clientName: "Nova Retail Group",
    detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: "mock-finding-3",
    title: "SSL certificate expires in 14 days",
    severity: "HIGH",
    assetName: "portal.helix-mfg.com",
    clientName: "Helix Manufacturing",
    detectedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
  {
    id: "mock-finding-4",
    title: "X-Frame-Options header not set",
    severity: "MEDIUM",
    assetName: "app.pinnaclefinance.com",
    clientName: "Pinnacle Finance",
    detectedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    id: "mock-finding-5",
    title: "Outdated jQuery library detected",
    severity: "MEDIUM",
    assetName: "legacy.acme-iot.com",
    clientName: "Acme IoT Solutions",
    detectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
];

export const MOCK_RECENT_ACTIVITY: DashboardActivity[] = [
  {
    id: "mock-activity-1",
    action: "Incident opened",
    description: "Suspicious login attempts on admin portal",
    actor: "Security Analyst",
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: "mock-activity-2",
    action: "Remediation completed",
    description: "HSTS header configured on api.novaretail.com",
    actor: "DevOps Engineer",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "mock-activity-3",
    action: "Asset registered",
    description: "New IoT gateway added for Helix Manufacturing",
    actor: "Platform Admin",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: "mock-activity-4",
    action: "Finding resolved",
    description: "Weak cipher suite removed from staging server",
    actor: "Security Analyst",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
  {
    id: "mock-activity-5",
    action: "Report generated",
    description: "Monthly security posture report for Pinnacle Finance",
    actor: "System",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
];

export const MOCK_REMEDIATION_METRICS: DashboardRemediationMetric = {
  openTasks: 42,
  inProgress: 18,
  completedThisMonth: 67,
  overdueTasks: 5,
  averageResolutionDays: 4.2,
  completionRate: 73.5,
};
