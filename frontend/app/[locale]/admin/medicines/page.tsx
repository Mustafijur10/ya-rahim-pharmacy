"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { PageButtons } from "@/components/admin/stock/StockBits";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { ErrorState, Spinner } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { pageInfo, type Paged, type References } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";
import { number } from "@/lib/format";

type Row = {
  id: number;
  name: string;
  strength: string | null;
  dosage_form: string | null;
  barcode: string | null;
  rx_required: boolean;
  is_active: boolean;
  sell_online: boolean;
  reorder_level: number;
  stock_units: string | number | null;
  generic: { name: string } | null;
  company: { name: string } | null;
  category: { name: string } | null;
  default_pack_size: { short_name: string; units: number } | null;
};

/** Catalogue of medicines; the form opens from here (design: Stock › Medicines). */
export default function MedicinesPage() {
  return (
    <RequireModule module="inventory" levels={["full", "view"]}>
      <Medicines />
    </RequireModule>
  );
}

function Medicines() {
  const locale = useLocale();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const filters = { search: search || undefined, company_id: company || undefined, active: status === "" ? undefined : status };
  const list = useQuery({
    queryKey: ["admin", "medicines", filters, page],
    queryFn: () => apiGet<Paged<Row>>("/admin/medicines", { ...filters, page }),
    placeholderData: (prev) => prev,
  });
  const info = pageInfo(list.data);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Medicines"
        subtitle={info.total ? `${number(info.total, locale)} medicines in the catalogue` : "Catalogue"}
        actions={
          can("inventory", "full") ? (
            <Link href="/admin/medicines/new" className="btn-primary">
              Add medicine
            </Link>
          ) : null
        }
      />
      <section className="table-card">
        <div className="table-card-filters">
          <label htmlFor="med-q" className="sr-only">
            Search medicines
          </label>
          <input id="med-q" className="input flex-[1_1_280px]" placeholder="Search brand, generic or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
          <select
            className="select w-auto"
            aria-label="Company"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All companies</option>
            {refs.data?.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="select w-auto"
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">On sale &amp; hidden</option>
            <option value="1">On sale</option>
            <option value="0">Hidden</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th scope="col">Medicine</th>
                <th scope="col">Company</th>
                <th scope="col">Category</th>
                <th scope="col">Stock</th>
                <th scope="col">Barcode</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.isError && (
                <tr>
                  <td colSpan={6}>
                    <ErrorState message="Couldn’t load medicines." onRetry={() => list.refetch()} />
                  </td>
                </tr>
              )}
              {list.isLoading && (
                <tr>
                  <td colSpan={6}>
                    <Spinner />
                  </td>
                </tr>
              )}
              {list.data?.data.map((m) => {
                const per = m.default_pack_size?.units ?? 1;
                const units = Number(m.stock_units ?? 0);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/medicines/${m.id}`} className="flex flex-col">
                        <b className="flex items-center gap-1.5 font-medium text-ink">
                          {[m.name, m.strength, m.dosage_form].filter(Boolean).join(" ")}
                          {m.rx_required && <span className="badge-rx">Rx</span>}
                        </b>
                        <span className="text-xs text-brand dark:text-brand-line">{m.generic?.name ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="text-ink-2">{m.company?.name ?? "—"}</td>
                    <td className="text-ink-2">{m.category?.name ?? "—"}</td>
                    <td className={units < m.reorder_level ? "font-medium text-rx" : "font-medium"}>
                      {+(units / per).toFixed(1)} {m.default_pack_size?.short_name ?? "units"}
                    </td>
                    <td className="font-mono text-[13px] text-ink-2">{m.barcode ?? "—"}</td>
                    <td>{!m.is_active ? <span className="badge-neutral">Hidden</span> : m.sell_online ? <span className="badge-stock">Shop + online</span> : <span className="badge-neutral">Shop only</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-card-foot">
          <span>{info.total ? `Showing ${info.from}–${info.to} of ${number(info.total, locale)}` : ""}</span>
          <PageButtons page={info.page} last={info.last} onChange={setPage} />
        </div>
      </section>
    </div>
  );
}
