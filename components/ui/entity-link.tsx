import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Consistent in-app entity link used across detail tables.
 */
export function EntityLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("hover:text-accent", className)}>
      {children}
    </Link>
  );
}
