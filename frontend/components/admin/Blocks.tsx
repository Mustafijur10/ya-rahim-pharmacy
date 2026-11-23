import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/** Figure tile with the coloured dot from the dashboards; whole tile links when href is set. */
export function KpiTile({ label, value, sub, tone = "neutral", href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "alert" | "warn" | "danger"; href?: string }) {
  const body = (
    <>
      <span className="kpi-label">
        {label}
        <span className={`kpi-dot kpi-dot-${tone}`} aria-hidden="true" />
      </span>
      <span className="kpi-value">{value}</span>
      {sub && <span className={`kpi-hint ${tone !== "neutral" ? `kpi-sub-${tone}` : ""}`}>{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="kpi-tile kpi-tile-link">
      {body}
    </Link>
  ) : (
    <div className="kpi-tile">{body}</div>
  );
}

export function Panel({ title, subtitle, action, children, className = "" }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div className="flex min-w-0 flex-col">
          <h2 className="panel-title">{title}</h2>
          {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "Expired" / "12 days" / "Mar 2027" pill in the expiry colours. */
export function ExpiryPill({ level, days, date }: { level: "red" | "amber" | "green"; days: number; date?: string }) {
  const text = days <= 0 ? "Expired" : days < 120 ? `${days} days` : (date ?? `${days} days`);
  return <span className={`expiry-${level}`}>{text}</span>;
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="m-0 py-2 text-sm text-muted">{children}</p>;
}
