import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "lg" = "md", block = false, extra = "") {
  return [`btn-${variant}`, size === "lg" ? "btn-lg" : "", block ? "w-full" : "", extra].filter(Boolean).join(" ");
}

/** Every button is at least 44px tall (touch target rule from the design brief). */
export default function Button({ variant = "primary", size = "md", loading = false, icon, block = false, className = "", children, disabled, type = "button", ...rest }: Props) {
  return (
    <button type={type} className={buttonClass(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={18} className="spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
