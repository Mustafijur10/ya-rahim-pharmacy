"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Pagination } from "@/components/ui/Data";
import { EmptyState, ErrorState } from "@/components/ui/Feedback";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiGet } from "@/lib/api";
import { number } from "@/lib/format";
import type { CatalogPage, Facet } from "@/lib/types";
import { ProductGrid, ProductGridSkeleton } from "./ProductCard";

const SORTS = [
  ["popular", "Most popular"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["discount", "Biggest discount"],
  ["newest", "Newest"],
] as const;

type Props = {
  /** Fixed filters for this page, e.g. { category: "healthcare" } or { on_discount: "1" }. */
  fixed?: Record<string, string>;
  /** Label for the "Type" facet (sub-categories). */
  typeLabel?: string;
};

/** Listing with filters. All filter state lives in the URL so pages can be shared and bookmarked. */
export default function CatalogBrowser({ fixed = {}, typeLabel = "Type" }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const sortId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const get = (k: string) => params.get(k) ?? "";
  const list = (k: string) => get(k).split(",").filter(Boolean);

  const query: Record<string, string> = { per_page: "24", ...fixed };
  for (const k of ["search", "types", "brands", "in_stock", "on_discount", "min_price", "max_price", "sort", "page"]) {
    if (get(k)) query[k] = get(k);
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["catalog", query],
    queryFn: () => apiGet<CatalogPage>("/store/medicines", query),
    placeholderData: keepPreviousData,
  });

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggle(key: "types" | "brands", slug: string) {
    const current = list(key);
    update({ [key]: (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]).join(",") });
  }

  const facets = data?.facets;
  const typeName = (f: Facet) => (locale === "bn" && f.name_bn ? f.name_bn : f.name);

  // Active filter chips (design: "Blood pressure monitors ×  In stock ×").
  const chips: { label: string; clear: () => void }[] = [
    ...list("types").map((s) => ({ label: facets?.types.find((f) => f.slug === s)?.name ?? s, clear: () => toggle("types", s) })),
    ...list("brands").map((s) => ({ label: facets?.brands.find((f) => f.slug === s)?.name ?? s, clear: () => toggle("brands", s) })),
    ...(get("in_stock") ? [{ label: "In stock", clear: () => update({ in_stock: null }) }] : []),
    ...(get("on_discount") && !fixed.on_discount ? [{ label: "On discount", clear: () => update({ on_discount: null }) }] : []),
    ...(get("min_price") || get("max_price") ? [{ label: `৳${get("min_price") || 0} – ৳${get("max_price") || "any"}`, clear: () => update({ min_price: null, max_price: null }) }] : []),
    ...(get("search") ? [{ label: `“${get("search")}”`, clear: () => update({ search: null }) }] : []),
  ];

  return (
    <div className="catalog-layout">
      {/* Filters */}
      <aside className={`filters ${filtersOpen ? "filters-open" : ""}`} aria-label="Filters">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg">Filters</h2>
          <div className="flex items-center gap-2">
            {chips.length > 0 && (
              <button type="button" className="link-button text-sm" onClick={() => update({ types: null, brands: null, in_stock: null, on_discount: null, min_price: null, max_price: null, search: null })}>
                Clear all
              </button>
            )}
            <button type="button" className="btn-icon btn-ghost lg:hidden" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {facets && facets.types.length > 1 && (
          <FilterGroup title={typeLabel}>
            {facets.types.map((f) => (
              <FacetCheck key={f.slug} label={typeName(f)} count={f.count} checked={list("types").includes(f.slug)} onChange={() => toggle("types", f.slug)} />
            ))}
          </FilterGroup>
        )}

        {facets && facets.brands.length > 0 && (
          <FilterGroup title="Brand">
            {facets.brands.map((f) => (
              <FacetCheck key={f.slug} label={f.name} count={f.count} checked={list("brands").includes(f.slug)} onChange={() => toggle("brands", f.slug)} />
            ))}
          </FilterGroup>
        )}

        <FilterGroup title="Price (৳)">
          <PriceRange min={get("min_price")} max={get("max_price")} onApply={(min, max) => update({ min_price: min, max_price: max })} />
        </FilterGroup>

        <FilterGroup title="Availability">
          <FacetCheck label="In stock only" count={facets?.in_stock} checked={!!get("in_stock")} onChange={() => update({ in_stock: get("in_stock") ? null : "1" })} />
          {!fixed.on_discount && <FacetCheck label="On discount" count={facets?.on_discount} checked={!!get("on_discount")} onChange={() => update({ on_discount: get("on_discount") ? null : "1" })} />}
        </FilterGroup>
      </aside>
      {filtersOpen && <button type="button" className="sidebar-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}

      {/* Results */}
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted" aria-live="polite">
            <button type="button" className="btn-ghost lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={18} aria-hidden="true" />
              Filters{chips.length ? ` (${chips.length})` : ""}
            </button>
            {data && (
              <span>
                {data.meta.total ? `Showing ${data.meta.from}–${data.meta.to} of ${number(data.meta.total, locale)}` : "No products"}
                {isFetching && " · updating…"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={sortId} className="text-sm text-muted">
              Sort by
            </label>
            <select id={sortId} className="select h-11 w-auto" value={get("sort") || "popular"} onChange={(e) => update({ sort: e.target.value === "popular" ? null : e.target.value })}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.label}>
                <button type="button" className="chip chip-active" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
                  {c.label}
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {isError ? (
          <ErrorState message="Couldn’t load products." onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <ProductGridSkeleton />
        ) : data.data.length === 0 ? (
          <EmptyState title="No products match these filters" description="Try removing a filter, or search by the generic name." />
        ) : (
          <ProductGrid items={data.data} locale={locale} />
        )}

        {data && (
          <Pagination
            page={data.meta.current_page}
            lastPage={data.meta.last_page}
            label={`Page ${data.meta.current_page} of ${data.meta.last_page}`}
            onChange={(p) => {
              update({ page: p > 1 ? String(p) : null }, false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="filter-group">
      <legend className="filter-title">{title}</legend>
      <div className="flex flex-col gap-0.5">{children}</div>
    </fieldset>
  );
}

function FacetCheck({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="facet">
      <input type="checkbox" className="checkbox" checked={checked} onChange={onChange} />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-muted">{count}</span>}
    </label>
  );
}

function PriceRange({ min, max, onApply }: { min: string; max: string; onApply: (min: string | null, max: string | null) => void }) {
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  const minId = useId();
  const maxId = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep inputs in step with the URL (e.g. after "Clear all")
    setLo(min);
    setHi(max);
  }, [min, max]);

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(lo || null, hi || null);
      }}
    >
      <div className="field flex-1">
        <label htmlFor={minId} className="field-hint">
          Min
        </label>
        <input id={minId} className="input h-11" inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value.replace(/\D/g, ""))} placeholder="0" />
      </div>
      <span className="pb-3 text-muted" aria-hidden="true">
        –
      </span>
      <div className="field flex-1">
        <label htmlFor={maxId} className="field-hint">
          Max
        </label>
        <input id={maxId} className="input h-11" inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value.replace(/\D/g, ""))} placeholder="10,000" />
      </div>
      <button type="submit" className="btn-outline px-3">
        Go
      </button>
    </form>
  );
}
