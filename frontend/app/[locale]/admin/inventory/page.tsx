"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { AdjustDialog, HistoryDialog } from "@/components/admin/stock/StockDialogs";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { ChipTabs } from "@/components/ui/Data";
import { ErrorState, PageLoader, Spinner } from "@/components/ui/Feedback";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ExpiryTag, PageButtons } from "@/components/admin/stock/StockBits";
import { pageInfo, type BatchRow, type InventorySummary, type Paged, type References } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";
import { number, taka } from "@/lib/format";

type Tab = "all" | "low" | "expiring" | "expired" | "out";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low", label: "Low stock" },
  { key: "expiring", label: "Expiring ≤ 90 days" },
  { key: "expired", label: "Expired" },
  { key: "out", label: "Out of stock" },
];

export default function InventoryPage() {
  return (
    <RequireModule module="inventory" levels={["full", "view"]}>
      <Suspense fallback={<PageLoader />}>
        <Inventory />
      </Suspense>
    </RequireModule>
  );
}

function Inventory() {
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useAuth();
  const tab = (params.get("tab") as Tab | null) ?? "all";
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState("");
  const [rack, setRack] = useState("");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<{ batch: BatchRow | null } | null>(null);
  const [history, setHistory] = useState<BatchRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const summary = useQuery({ queryKey: ["admin", "inventory", "summary"], queryFn: () => apiGet<InventorySummary>("/admin/inventory/summary") });
  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const filters = { tab, search: search || undefined, category_id: category || undefined, company_id: company || undefined, rack: rack || undefined };
  const list = useQuery({
    queryKey: ["admin", "inventory", "list", filters, page],
    queryFn: () => apiGet<Paged<BatchRow>>("/admin/inventory", { ...filters, page, per_page: 25 }),
    placeholderData: (prev) => prev,
  });

  if (summary.isLoading) return <PageLoader />;
  if (summary.isError || !summary.data) return <ErrorState message="Couldn’t load inventory." onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const info = pageInfo(list.data);
  const canEdit = can("inventory", "full");
  const canAdjust = can("stock_adjustment", "full", "approval");
  const exportHref = `/api/admin/inventory/export?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inventory"
        subtitle={`${number(s.medicines, locale)} medicines · ${number(s.batches, locale)} batches${s.stock_value_cost !== undefined ? ` · stock value ${taka(s.stock_value_cost, locale)} at cost` : ""}`}
        actions={
          <>
            <a href={exportHref} className="btn-outline hidden 2xl:inline-flex" download>
              <Download size={18} aria-hidden="true" />
              Export
            </a>
            {canAdjust && (
              <Button variant="outline" className="hidden xl:inline-flex" onClick={() => setAdjusting({ batch: null })}>
                Stock adjustment
              </Button>
            )}
            {can("purchases", "full") && (
              <Link href="/admin/purchases" className="btn-outline btn-outline-brand hidden xl:inline-flex">
                Purchase entry
              </Link>
            )}
            {canEdit && (
              <Link href="/admin/medicines/new" className="btn-primary">
                Add medicine
              </Link>
            )}
          </>
        }
      />

      <ChipTabs
        label="Stock views"
        value={tab}
        onChange={(k) => {
          setPage(1);
          router.replace(k === "all" ? pathname : `${pathname}?tab=${k}`, { scroll: false });
        }}
        items={TABS.map((t) => ({ key: t.key, label: t.label, count: s.tabs[t.key] }))}
      />

      <section className="table-card">
        <div className="table-card-filters">
          <label htmlFor="inv-q" className="sr-only">
            Search inventory
          </label>
          <input id="inv-q" className="input flex-[1_1_280px]" placeholder="Search brand, generic, batch or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select w-auto" aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {refs.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
          <select className="select w-auto" aria-label="Company" value={company} onChange={(e) => { setCompany(e.target.value); setPage(1); }}>
            <option value="">All companies</option>
            {refs.data?.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="select w-auto" aria-label="Rack" value={rack} onChange={(e) => { setRack(e.target.value); setPage(1); }}>
            <option value="">All racks</option>
            {s.racks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[980px]">
            <thead>
              <tr>
                <th scope="col">Medicine</th>
                <th scope="col">Batch</th>
                <th scope="col">Expiry</th>
                <th scope="col">Stock</th>
                <th scope="col">Reorder at</th>
                {s.stock_value_cost !== undefined && <th scope="col">Cost</th>}
                <th scope="col">MRP</th>
                <th scope="col">Rack</th>
                <th scope="col" className="text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isError && (
                <tr>
                  <td colSpan={9}>
                    <ErrorState message="Couldn’t load batches." onRetry={() => list.refetch()} />
                  </td>
                </tr>
              )}
              {list.isLoading && (
                <tr>
                  <td colSpan={9}>
                    <Spinner />
                  </td>
                </tr>
              )}
              {list.data?.data.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted">
                    Nothing here.
                  </td>
                </tr>
              )}
              {list.data?.data.map((b) => {
                const low = b.medicine ? b.quantity < b.medicine.reorder_level : false;
                return (
                  <tr key={b.id}>
                    <td>
                      <div className="flex flex-col">
                        <b className="font-medium">{b.medicine?.name}</b>
                        <span className="text-xs text-brand dark:text-brand-line">{[b.medicine?.generic, b.medicine?.company].filter(Boolean).join(" · ")}</span>
                      </div>
                    </td>
                    <td className="font-mono text-[13px]">{b.batch_no}</td>
                    <td>
                      <ExpiryTag b={b} />
                    </td>
                    <td className={low || b.quantity === 0 ? "font-medium text-rx" : "font-medium"}>
                      {b.quantity_packs} {b.pack_name ?? "units"}
                      {b.quantity_packs !== b.quantity && <span className="block text-xs font-normal text-muted">{b.quantity} units</span>}
                    </td>
                    <td className="text-muted">{b.medicine?.reorder_level_packs}</td>
                    {s.stock_value_cost !== undefined && <td className="tabular-nums">{b.cost_per_pack !== undefined ? taka(b.cost_per_pack, locale) : "—"}</td>}
                    <td className="tabular-nums">{taka(b.mrp_per_pack, locale)}</td>
                    <td>{b.rack ?? "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-3 text-[13px] font-medium">
                        {canEdit && b.medicine && <Link href={`/admin/medicines/${b.medicine.id}`}>Edit</Link>}
                        <button type="button" className="link-button" onClick={() => setHistory(b)}>
                          History
                        </button>
                        {canAdjust && (
                          <button type="button" className="link-button" onClick={() => setAdjusting({ batch: b })}>
                            Adjust
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-card-foot">
          <span>{info.total ? `Showing ${info.from}–${info.to} of ${number(info.total, locale)} batches` : ""}</span>
          <PageButtons page={info.page} last={info.last} onChange={setPage} />
        </div>
      </section>
      <p className="m-0 text-[13px] text-muted">
        Expiry colours: red = expired or under 30 days (move to return-to-supplier), amber = within 90 days (sell first), green = safe. Stock is shared live between the shop POS and the online store.
      </p>

      {adjusting && <AdjustDialog key={adjusting.batch?.id ?? "new"} open batch={adjusting.batch} onClose={() => setAdjusting(null)} />}
      <HistoryDialog batch={history} onClose={() => setHistory(null)} />
    </div>
  );
}
