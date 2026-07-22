import Link from "next/link";
import {
  ClientStatusBadge,
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
            <th className="hidden px-4 py-3 font-medium text-muted md:table-cell">
              Industry
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Website
            </th>
            <th className="px-4 py-3 font-medium text-muted">Status</th>
            <th className="px-4 py-3 font-medium text-muted">Score</th>
            <th className="hidden px-4 py-3 font-medium text-muted sm:table-cell">
              Assets
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Findings
            </th>
            <th className="hidden px-4 py-3 font-medium text-muted lg:table-cell">
              Incidents
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
              </td>
              <td className="hidden px-4 py-3 text-muted md:table-cell">
                {client.industry ?? "—"}
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                {client.website ? (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <ClientStatusBadge status={client.status} />
              </td>
              <td className="px-4 py-3">
                <SecurityScoreIndicator score={client.securityScore} />
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted sm:table-cell">
                {client.assetsCount}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted lg:table-cell">
                {client.openFindingsCount}
              </td>
              <td className="hidden px-4 py-3 tabular-nums text-muted lg:table-cell">
                {client.openIncidentsCount}
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
