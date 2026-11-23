"use client";

import { useQuery } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyRow, KpiTile, Panel } from "@/components/admin/Blocks";
import { CloseShiftDialog, OpenShiftCard } from "@/components/admin/ShiftDialogs";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { PageHeader } from "@/components/admin/AdminHeader";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import { APPROVER, approvalTitle, type CounterDashboard } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";
import { clock, dateTime, taka } from "@/lib/format";

export default function CounterPage() {
  return (
    <RequireModule module="pos">
      <Counter />
    </RequireModule>
  );
}

function Counter() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const [closing, setClosing] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "counter"],
    queryFn: () => apiGet<CounterDashboard>("/admin/dashboard/counter"),
    refetchInterval: 30_000,
  });

  // F1 = start a new sale (shortcut shown on the tile).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        router.push("/admin/pos");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Couldn’t load your counter." onRetry={() => refetch()} />;
  const { kpis: k, shift, drawer } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={shift ? `${shift.counter_name} — ${user?.name}` : `My counter — ${user?.name}`}
        subtitle={shift ? `Shift opened ${dateTime(shift.opened_at, locale)} with ${taka(shift.opening_cash, locale)} opening cash` : "No shift open"}
        actions={
          shift && drawer ? (
            <Button variant="outline" onClick={() => setClosing(true)}>
              Close shift
            </Button>
          ) : null
        }
      />

      {!shift ? (
        <OpenShiftCard />
      ) : (
        <>
          <Link href="/admin/pos" className="start-sale">
            <span className="kbd kbd-lg">F1</span>
            <span className="flex flex-col">
              <span className="text-xl font-bold">Start new sale</span>
              <span className="text-sm opacity-90">Scan a barcode or search a medicine</span>
            </span>
            <ScanBarcode size={28} aria-hidden="true" className="ml-auto" />
          </Link>

          <div className="kpi-grid kpi-grid-4">
            <KpiTile label="My sales today" value={taka(k.sales_today, locale)} sub={`${k.receipts_today} receipts`} />
            <KpiTile label="Cash" value={taka(k.cash_today, locale)} sub="In drawer" />
            <KpiTile label="bKash / Nagad / Card" value={taka(k.digital_today, locale)} sub="Digital payments" />
            <KpiTile label="Held sales" value={k.held_sales} sub="Waiting for customer" href="/admin/pos?held=1" tone={k.held_sales ? "warn" : "neutral"} />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Panel title={<>My receipts today <span className="text-sm font-normal text-muted">{k.receipts_today} receipts</span></>}>
              {data.receipts.length === 0 ? (
                <EmptyRow>No sales yet. Press F1 to start.</EmptyRow>
              ) : (
                <div className="table-wrap table-wrap-flat">
                  <table className="table">
                    <caption className="sr-only">My receipts today</caption>
                    <thead>
                      <tr>
                        <th scope="col">Receipt</th>
                        <th scope="col">Time</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Paid by</th>
                        <th scope="col" className="text-right">Amount</th>
                        <th scope="col" className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.receipts.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{r.code}</td>
                          <td>{clock(r.created_at)}</td>
                          <td>{(r as { customer?: { name: string } | null }).customer?.name ?? "Walk-in"}</td>
                          <td>{r.payments?.map((p) => p.method_label).join(" + ") || "—"}</td>
                          <td className="text-right font-medium">{taka(r.total, locale)}</td>
                          <td className="text-right whitespace-nowrap">
                            <Link href={`/admin/pos/receipt/${r.id}`} className="mr-3 text-sm font-medium">
                              Reprint
                            </Link>
                            <Link href={`/admin/returns?order=${encodeURIComponent(r.code)}`} className="text-sm font-medium">
                              Return
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="flex flex-col gap-6">
              <Panel title="My requests">
                {data.requests.length === 0 ? (
                  <EmptyRow>No requests today.</EmptyRow>
                ) : (
                  <ul className="list-rows">
                    {data.requests.map((a) => (
                      <li key={a.id}>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{approvalTitle(a)}</span>
                          <span className="text-xs text-muted">To {APPROVER[a.type]}</span>
                        </span>
                        <span className={a.status === "approved" ? "badge-stock" : a.status === "rejected" ? "badge-rx" : "badge-warn"}>
                          {a.status === "pending" ? "Waiting" : a.status === "approved" ? (a.used ? "Used" : "Approved") : "Rejected"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {drawer && (
                <Panel title="Cash drawer">
                  <dl className="summary-list">
                    <dt>Opening cash</dt>
                    <dd>{taka(drawer.opening_cash, locale)}</dd>
                    <dt>Cash sales</dt>
                    <dd>{taka(drawer.cash_sales, locale)}</dd>
                    <dt>Cash refunds</dt>
                    <dd>− {taka(drawer.cash_refunds, locale)}</dd>
                    <dt className="summary-total">Expected in drawer</dt>
                    <dd className="summary-total">{taka(drawer.expected_cash, locale)}</dd>
                  </dl>
                  <p className="m-0 text-sm text-muted">At close, count the cash. Any difference is sent to the manager.</p>
                </Panel>
              )}
            </div>
          </div>

          {drawer && <CloseShiftDialog shiftId={shift.id} drawer={drawer} open={closing} onClose={() => setClosing(false)} />}
        </>
      )}
    </div>
  );
}
