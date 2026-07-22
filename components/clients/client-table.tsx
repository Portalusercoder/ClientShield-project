import Link from "next/link";
import {
  ClientStatusBadge,
  OnboardingStatusBadge,
  ReadinessBadge,
  SecurityScoreIndicator,
} from "@/components/clients/client-status-badge";
import { formatDate } from "@/lib/utils";
import type { ClientListItem } from "@/types/client";

interface ClientTableProps {
  clients: ClientListItem[];
}

export function ClientTable({ clients }: ClientTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-elevated">
            <th className="px-4 py-3 font-medium text-muted">Client Name</th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Onboarding
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Readiness
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Assets
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Services
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Open Findings
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Open Incidents
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted xl:table-cell">
              Score
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted xl:table-cell">
              Date Added
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map((client) => (
            <tr
              key={client.id}
              className="bg-surface transition-colors hover:bg-surface-elevated/50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/clients/${client.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {client.name}
                </Link>
                {client.industry && (
                  <p className="mt-0.5 text-xs text-muted">{client.industry}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <ClientStatusBadge status={client.status} />
              </td>
              <td className="hidden px-4 py-3 md:table-cell">
                <OnboardingStatusBadge status={client.onboardingStatus} />
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <ReadinessBadge overall={client.readinessSummary?.overall} />
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                {client.assetsCount}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                {client.servicesCount}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted lg:table-cell">
                {client.openFindingsCount}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted lg:table-cell">
                {client.openIncidentsCount}
              </td>
              <td className="hidden px-4 py-3 xl:table-cell">
                <SecurityScoreIndicator score={client.securityScore} />
              </td>
              <td className="hidden px-4 py-3 text-muted xl:table-cell">
                {formatDate(client.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
