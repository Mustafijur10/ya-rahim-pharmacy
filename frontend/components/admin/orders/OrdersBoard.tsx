"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/Feedback";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AdminOrder, OrderStats } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";
import { minutesAgo, taka, todayIso } from "@/lib/format";
import OrderDetail, { payLabel } from "./OrderDetail";

type StageKey = "new" | "rx_verification" | "packing" | "ready_for_pickup" | "out_for_delivery" | "done" | "cancelled";

const STAGES: { key: StageKey; label: string; stat: keyof OrderStats; dot: string; queue: string }[] = [
  { key: "new", label: "New", stat: "new", dot: "stage-dot-new", queue: "New orders" },
  { key: "rx_verification", label: "Rx verification", stat: "rx_verification", dot: "stage-dot-rx", queue: "Rx verification queue" },
  { key: "packing", label: "Packing", stat: "packing", dot: "stage-dot-packing", queue: "Being packed" },
  { key: "ready_for_pickup", label: "Ready for pickup", stat: "ready_for_pickup", dot: "stage-dot-packing", queue: "Waiting at the counter" },
  { key: "out_for_delivery", label: "Out for delivery", stat: "out_for_delivery", dot: "stage-dot-transit", queue: "With riders" },
  { key: "done", label: "Delivered today", stat: "delivered_today", dot: "stage-dot-done", queue: "Delivered today" },
  { key: "cancelled", label: "Cancelled", stat: "cancelled_today", dot: "stage-dot-cancelled", queue: "Cancelled today" },
];

/**
 * Online orders (design: "Admin — Online orders"): stage counts, the queue for the chosen stage and
 * the selected order. `lockStage` turns it into the prescriptions-only queue.
 */
export default function OrdersBoard({ title, subtitle, defaultStage = "new", lockStage = false, toolbar }: { title: string; subtitle: string; defaultStage?: StageKey; lockStage?: boolean; toolbar?: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stage = (lockStage ? defaultStage : (params.get("stage") as StageKey | null)) ?? defaultStage;
  const selected = Number(params.get("order")) || null;
  const [q, setQ] = useState(params.get("search") ?? "");
  const [search, setSearch] = useState(q);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const stats = useQuery({ queryKey: ["admin", "orders", "stats"], queryFn: () => apiGet<OrderStats>("/admin/orders/stats"), refetchInterval: 20_000 });

  const listParams: Record<string, unknown> = { channel: "web", per_page: 50, search: search || undefined };
  if (!search) {
    if (stage === "done") Object.assign(listParams, { status: "completed", from: todayIso() });
    else if (stage === "cancelled") Object.assign(listParams, { status: "cancelled", from: todayIso() });
    else listParams.status = stage;
  }
  const list = useQuery({
    queryKey: ["admin", "orders", "list", listParams],
    queryFn: () => apiGet<{ data: AdminOrder[] }>("/admin/orders", listParams),
    refetchInterval: 20_000,
    placeholderData: (prev) => prev,
  });
  const orders = list.data?.data ?? [];
  const activeId = selected ?? orders[0]?.id ?? null;
  const stageInfo = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const live = ["new", "rx_verification", "packing", "ready_for_pickup"].includes(stage);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="order-search">
            <Search size={18} aria-hidden="true" />
            <label htmlFor="order-q" className="sr-only">
              Search orders
            </label>
            <input id="order-q" placeholder="Search order no. or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      {toolbar}
      {!lockStage && (
        <div className="stage-grid" role="group" aria-label="Order stages">
          {STAGES.map((s) => (
            <button key={s.key} type="button" aria-pressed={stage === s.key && !search} className={stage === s.key && !search ? "stage stage-active" : "stage"} onClick={() => {
              setQ("");
              setParam({ stage: s.key, order: null });
            }}>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
                <span className={`stage-dot ${s.dot}`} aria-hidden="true" />
                {s.label}
              </span>
              <span className="text-2xl font-bold">{stats.data ? stats.data[s.stat] : "–"}</span>
            </button>
          ))}
        </div>
      )}

      <div className="orders-layout">
        <section className="order-queue" aria-label={stageInfo.queue}>
          <div className="order-queue-head">
            {search ? `Results for “${search}”` : stageInfo.queue}
            {list.isFetching && <Spinner size={16} label="" />}
          </div>
          {list.isError ? (
            <ErrorState message="Couldn’t load orders." onRetry={() => list.refetch()} />
          ) : list.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-4">
              <EmptyState title={search ? "No orders found" : "Nothing here right now"} />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {orders.map((o) => {
                const age = minutesAgo(o.placed_at ?? o.created_at);
                return (
                  <li key={o.id}>
                    <button type="button" className={o.id === activeId ? "order-row order-row-active" : "order-row"} aria-current={o.id === activeId ? "true" : undefined} onClick={() => setParam({ order: String(o.id) })}>
                      <span className="flex justify-between gap-2">
                        <b className="truncate text-sm font-medium">
                          #{o.code} · {o.customer?.name ?? o.recipient_name ?? "Customer"}
                        </b>
                        <span className={live && age > 30 ? "shrink-0 text-xs font-medium text-rx" : "shrink-0 text-xs font-medium text-muted"}>{age < 60 ? `${age} min` : age < 1440 ? `${Math.floor(age / 60)} h` : `${Math.floor(age / 1440)} d`}</span>
                      </span>
                      <span className="text-[13px] text-muted">
                        {o.items_count ?? 0} item{o.items_count === 1 ? "" : "s"} · {taka(o.total, locale)} · {payLabel(o)}
                        {search ? ` · ${o.status_label}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {activeId ? (
          <OrderDetail
            key={activeId}
            id={activeId}
            onChanged={() => {
              stats.refetch();
              list.refetch();
            }}
          />
        ) : (
          <section className="panel items-center justify-center py-16 text-sm text-muted">Choose an order from the list.</section>
        )}
      </div>
    </div>
  );
}
