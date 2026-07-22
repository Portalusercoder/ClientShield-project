import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

const variantStyles = {
  primary:
    "bg-accent text-white hover:bg-accent/90 border border-accent disabled:opacity-50",
  secondary:
    "bg-surface-elevated text-foreground hover:bg-border border border-border disabled:opacity-50",
  danger:
    "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30 disabled:opacity-50",
  ghost:
    "text-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-50",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
