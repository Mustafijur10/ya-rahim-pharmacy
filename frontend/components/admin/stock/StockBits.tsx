import type { BatchRow } from "@/lib/admin-types";

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso));

/** "Expired Nov 2026" · "12 days" · "Jan 2027" in the expiry colours (design legend under the table). */
export function ExpiryTag({ b }: { b: Pick<BatchRow, "expiry_date" | "expiry_level" | "days_to_expiry"> }) {
  const text = b.days_to_expiry <= 0 ? `Expired ${monthYear(b.expiry_date)}` : b.days_to_expiry <= 30 ? `${b.days_to_expiry} days` : monthYear(b.expiry_date);
  return <span className={`expiry-${b.expiry_level}`}>{text}</span>;
}

/** ‹ 1 2 3 › page buttons (design: inventory footer). */
export function PageButtons({ page, last, onChange }: { page: number; last: number; onChange: (p: number) => void }) {
  if (last <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, last - 4));
  const pages = Array.from({ length: Math.min(5, last) }, (_, i) => start + i);
  return (
    <nav className="flex gap-1.5" aria-label="Pages">
      <button type="button" className="page-btn" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        ‹
      </button>
      {pages.map((p) => (
        <button key={p} type="button" className={p === page ? "page-btn page-btn-active" : "page-btn"} aria-current={p === page ? "page" : undefined} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      <button type="button" className="page-btn" onClick={() => onChange(page + 1)} disabled={page >= last} aria-label="Next page">
        ›
      </button>
    </nav>
  );
}
