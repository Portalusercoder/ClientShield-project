import { cn } from "@/lib/utils";
import type { PostureStatus } from "@/types/security-check";

const STYLES: Record<PostureStatus, string> = {
  Good: "text-success",
  "Needs Attention": "text-warning",
  Critical: "text-danger",
  "Not Applicable": "text-muted",
};

interface SecurityPostureCardProps {
  https: PostureStatus;
  tls: PostureStatus;
  headers: PostureStatus;
  cookies: PostureStatus;
}

export function SecurityPostureCard({
  https,
  tls,
  headers,
  cookies,
}: SecurityPostureCardProps) {
  const items = [
    { label: "HTTPS", value: https },
    { label: "TLS Certificate", value: tls },
    { label: "Security Headers", value: headers },
    { label: "Cookie Security", value: cookies },
  ];

  return (
    <dl className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className={cn("text-sm font-medium", STYLES[item.value])}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
