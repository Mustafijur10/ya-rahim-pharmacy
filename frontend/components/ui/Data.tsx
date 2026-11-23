import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "", padded = true, as: Tag = "section" }: { children: ReactNode; className?: string; padded?: boolean; as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={`${padded ? "card-pad" : "card"} ${className}`}>{children}</Tag>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-2xl">{title}</h1>
        {subtitle && <p className="m-0 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type BadgeTone = "rx" | "stock" | "save" | "warn" | "neutral";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge-${tone}`}>{children}</span>;
}

/** Order status with the coloured dot from the design. */
export function StatusDot({ status, label }: { status: string; label: string }) {
  const tone: Record<string, string> = {
    new: "status-new",
    rx_verification: "status-rx",
    packing: "status-packing",
    ready_for_pickup: "status-packing",
    out_for_delivery: "status-transit",
    delivered: "status-done",
    completed: "status-done",
    cancelled: "status-cancelled",
  };
  return <span className={`status ${tone[status] ?? ""}`}>{label}</span>;
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className={`kpi-hint ${tone === "up" ? "kpi-up" : tone === "down" ? "kpi-down" : ""}`}>{hint}</span>}
    </div>
  );
}

export function Pagination({ page, lastPage, onChange, label }: { page: number; lastPage: number; onChange: (page: number) => void; label: string }) {
  if (lastPage <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn-ghost btn-icon" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="text-sm text-muted">{label}</span>
      <button type="button" className="btn-ghost btn-icon" onClick={() => onChange(page + 1)} disabled={page >= lastPage} aria-label="Next page">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}

export type TabItem<K extends string> = { key: K; label: ReactNode; count?: number };

/** Chip-style tabs (inventory, orders). Real buttons with aria-pressed. */
export function ChipTabs<K extends string>({ items, value, onChange, label }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((t) => (
        <button key={t.key} type="button" className={`chip ${value === t.key ? "chip-active" : ""}`} aria-pressed={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="chip-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
