"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";
import { EmptyRow, ExpiryPill, KpiTile, Panel } from "@/components/admin/Blocks";
import { CategoryDonut, HourlyLines, SalesBars, ShareBar, ShopOnlineLegend, TargetGauge, TopBars } from "@/components/admin/Charts";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageHeader } from "@/components/admin/AdminHeader";
import { StatusDot } from "@/components/ui/Data";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import type { OwnerDashboard } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";
import { number, taka, timeAgo, todayLong } from "@/lib/format";

export default function DashboardPage() {
  return (
    <RequireModule module="dashboard" levels={["full", "view"]}>
      <Dashboard />
    </RequireModule>
  );
}

function Dashboard() {
  const locale = useLocale();
  const { can, feature } = useAuth();
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "dashboard", days],
    queryFn: () => apiGet<OwnerDashboard>("/admin/dashboard", { days }),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev, // switching 7/30 days keeps the page on screen
  });

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Couldn’t load the dashboard." onRetry={() => refetch()} />;
  const k = data.kpis;
  const paidTotal = data.payments_today.reduce((s, p) => s + p.total, 0);
  const today = todayLong(locale);
  const t = data.target;
  const targetPct = t.target > 0 ? (t.sold / t.target) * 100 : 0;
  const toGo = Math.max(0, t.target - t.sold);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" subtitle={`${today} · Shop + online combined`} />

      <div className="kpi-grid">
        <KpiTile label="Today’s sales" value={taka(k.sales_today, locale)} sub={`Shop ${taka(k.sales_today_shop, locale)} · Online ${taka(k.sales_today_online, locale)}`} />
        <KpiTile label="Orders today" value={number(k.orders_today, locale)} sub={`${k.shop_orders_today} in shop · ${k.online_orders_today} online`} />
        <KpiTile label="Pending online orders" value={k.open_online_orders} sub={k.open_online_waiting_30 ? `${k.open_online_waiting_30} waiting over 30 min` : "None waiting long"} tone="alert" href="/admin/orders" />
        <KpiTile label="Prescriptions to verify" value={k.rx_waiting} sub={k.rx_oldest_at ? `Oldest ${timeAgo(k.rx_oldest_at)}` : "All checked"} tone="warn" href="/admin/prescriptions" />
        <KpiTile label="Low stock items" value={k.low_stock} sub="Below reorder level" tone="danger" href="/admin/inventory?tab=low" />
        <KpiTile label="Expiring ≤ 90 days" value={k.expiring_90} sub={`Batches · ${taka(k.expiring_90_cost, locale)} at cost`} tone="danger" href="/admin/expiry" />
      </div>

      <div className="dash-row">
        <Panel
          title={`Sales — last ${days} days`}
          subtitle="৳, shop vs online"
          action={
            <div className="flex flex-wrap items-center gap-4">
              <ShopOnlineLegend />
              <div className="segmented segmented-sm" role="group" aria-label="Chart range">
                {([7, 30] as const).map((d) => (
                  <button key={d} type="button" className={`segmented-option ${days === d ? "segmented-option-active" : ""}`} aria-pressed={days === d} onClick={() => setDays(d)}>
                    {d === 7 ? "7 days" : "30 days"}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <SalesBars days={data.chart} locale={locale} />
        </Panel>

        <Panel title="Payments today">
          {data.payments_today.length === 0 ? (
            <EmptyRow>No payments yet today.</EmptyRow>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.payments_today.map((p) => {
                const pct = paidTotal ? Math.round((p.total / paidTotal) * 100) : 0;
                return (
                  <li key={p.method} className="flex flex-col gap-1.5">
                    <span className="flex justify-between text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span>
                        {taka(p.total, locale)} <span className="text-muted">· {pct}%</span>
                      </span>
                    </span>
                    <ShareBar percent={pct} label={`${p.label} ${pct}%`} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="tile flex items-center justify-between">
            <span className="text-sm text-muted">Cash in drawer (expected)</span>
            <span className="text-lg font-bold">{taka(data.cash_in_drawers, locale)}</span>
          </div>
          {k.gross_profit_today !== undefined && (
            <div className="tile flex items-center justify-between">
              <span className="text-sm text-muted">Gross profit today</span>
              <span className="text-lg font-bold">{taka(k.gross_profit_today, locale)}</span>
            </div>
          )}
        </Panel>
      </div>

      <div className="dash-row">
        <Panel title="Sales by hour — today" subtitle="৳ per hour" action={<ShopOnlineLegend />}>
          <HourlyLines hours={data.hourly} locale={locale} />
        </Panel>
        <Panel title="Sales by category" subtitle="Share of today’s sales">
          {data.categories.length === 0 ? <EmptyRow>No sales yet today.</EmptyRow> : <CategoryDonut items={data.categories} locale={locale} />}
        </Panel>
      </div>

      <div className="dash-row">
        <Panel title="Top-selling medicines" subtitle="Packs sold today, shop + online">
          {data.top_medicines.length === 0 ? <EmptyRow>No sales yet today.</EmptyRow> : <TopBars items={data.top_medicines} />}
          {feature("reports") && (
            <Link href="/admin/reports" className="text-[13px] font-medium">
              See full report
            </Link>
          )}
        </Panel>
        <Panel title="Monthly sales target" subtitle={t.month}>
          <div className="flex flex-col items-center gap-2.5">
            <TargetGauge percent={targetPct} />
            <div className="target-stats">
              <div>
                <span className="text-[11px] text-muted">Sold</span>
                <br />
                <b className="text-sm">{taka(t.sold, locale)}</b>
              </div>
              <div>
                <span className="text-[11px] text-muted">Target</span>
                <br />
                <b className="text-sm">{taka(t.target, locale)}</b>
              </div>
              <div>
                <span className="text-[11px] text-muted">To go</span>
                <br />
                <b className="text-sm">{taka(toGo, locale)}</b>
              </div>
            </div>
            <span className="text-xs text-muted">
              {toGo > 0 ? `${t.days_left} days left · needs about ${taka(Math.ceil(toGo / Math.max(1, t.days_left)), locale)} a day` : "Target reached — well done!"}
            </span>
          </div>
        </Panel>
      </div>

      <div className="dash-row">
        <Panel title="Recent orders" action={<Link href="/admin/orders" className="text-sm font-medium">View all</Link>}>
          <div className="table-wrap table-wrap-flat">
            <table className="table">
              <caption className="sr-only">Recent orders</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Channel</th>
                  <th scope="col" className="text-right">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders?search=${encodeURIComponent(o.code)}`} className="font-medium">
                        {o.code}
                      </Link>
                    </td>
                    <td>{(o as { customer?: { name: string } | null }).customer?.name ?? "Walk-in"}</td>
                    <td>
                      <span className={o.channel === "shop" ? "channel-shop" : "channel-online"}>{o.channel === "shop" ? "Shop" : "Online"}</span>
                    </td>
                    <td className="text-right font-medium">{taka(o.total, locale)}</td>
                    <td>
                      <StatusDot status={o.status} label={o.status_label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Expiring soon" action={<Link href="/admin/expiry" className="text-sm font-medium">All {k.expiring_90}</Link>}>
            {data.expiring.length === 0 ? (
              <EmptyRow>Nothing expires in the next 90 days.</EmptyRow>
            ) : (
              <ul className="list-rows">
                {data.expiring.map((b) => (
                  <li key={b.id}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{b.medicine?.name}</span>
                      <span className="text-xs text-muted">
                        Batch {b.batch_no} · {b.quantity_packs} {b.pack_name ?? "units"}
                      </span>
                    </span>
                    <ExpiryPill level={b.expiry_level} days={b.days_to_expiry} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Low stock" action={can("purchases") && <Link href="/admin/purchases?new=1" className="text-sm font-medium">Create purchase order</Link>}>
            {data.low_stock.length === 0 ? (
              <EmptyRow>Everything is above its reorder level.</EmptyRow>
            ) : (
              <ul className="list-rows">
                {data.low_stock.map((m) => (
                  <li key={m.id}>
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="text-sm whitespace-nowrap">
                      <b className="text-rx">
                        {m.stock_packs} {m.pack ?? "units"}
                      </b>{" "}
                      <span className="text-muted">/ reorder at {m.reorder_packs}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
