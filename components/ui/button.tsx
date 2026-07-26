import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variantStyles = {
  primary:
    "bg-accent text-accent-foreground border border-accent hover:bg-[#1d4ed8] shadow-sm",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-surface-elevated shadow-sm",
  outline:
    "bg-transparent text-foreground border border-border hover:bg-surface-elevated",
  danger:
    "bg-danger text-white border border-danger hover:bg-[#b91c1c] shadow-sm",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-surface-elevated hover:text-foreground",
};

const sizeStyles = {
  sm: "h-8 px-3 text-xs rounded-[6px]",
  md: "h-9 px-4 text-sm rounded-[6px]",
  lg: "h-10 px-5 text-sm rounded-[6px]",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
