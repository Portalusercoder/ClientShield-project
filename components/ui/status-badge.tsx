import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: "bg-gray-50 text-gray-700 border-gray-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  accent: "bg-blue-50 text-blue-700 border-blue-200",
};

/** Map common domain statuses to tones. */
export function statusToneFromLabel(status: string): StatusTone {
  const s = status.toUpperCase().replace(/\s+/g, "_");
  if (
    ["CRITICAL", "BREACHED", "FAILED", "ESCALATED", "DANGER"].includes(s)
  ) {
    return "danger";
  }
  if (
    ["HIGH", "WARNING", "APPROACHING", "AT_RISK", "OVERDUE", "PENDING"].includes(
      s
    )
  ) {
    return "warning";
  }
  if (
    [
      "RESOLVED",
      "CLOSED",
      "SUCCESS",
      "READY",
      "ACTIVE",
      "COMPLETED",
      "MET",
      "ON_TRACK",
    ].includes(s)
  ) {
    return "success";
  }
  if (
    [
      "OPEN",
      "NEW",
      "INVESTIGATING",
      "IN_PROGRESS",
      "ACKNOWLEDGED",
      "TRIAGED",
      "VALIDATED",
    ].includes(s)
  ) {
    return "accent";
  }
  if (["INFO", "LOW", "MEDIUM"].includes(s)) return "info";
  return "neutral";
}

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusTone;
  status?: string;
  className?: string;
}

export function StatusBadge({
  children,
  tone,
  status,
  className,
}: StatusBadgeProps) {
  const resolved = tone ?? (status ? statusToneFromLabel(status) : "neutral");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        TONE_STYLES[resolved],
        className
      )}
    >
      {children}
    </span>
  );
}
