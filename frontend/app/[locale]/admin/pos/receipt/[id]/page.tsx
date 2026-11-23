"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Printer } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { RequireModule } from "@/components/auth/Guards";
import Button from "@/components/ui/Button";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { apiGet } from "@/lib/api";
import type { Order } from "@/lib/types";

type Item = NonNullable<Order["items"]>[number] & { batch?: { batch_no: string; expiry_date: string } | null };
type Payment = NonNullable<Order["payments"]>[number] & { received_amount?: number | null; change_amount?: number | null; transaction_id?: string | null };
type ReceiptData = {
  data: Omit<Order, "items" | "payments"> & {
    items?: Item[];
    payments?: Payment[];
    cashier?: { name: string } | null;
    pharmacist?: { name: string; registration_no: string | null } | null;
    customer?: { name: string; phone: string } | null;
  };
  store: { name: string | null; address: string | null; phone: string | null; drug_licence_no: string | null; tin_bin: string | null; email: string | null; footer: string | null };
};

const money = (n: number) => n.toFixed(2);
/** Settings still holding a "[placeholder]" are not printed. */
const clean = (v: string | null | undefined) => (v && !/\[[^\]]+\]/.test(v) ? v : null);
const dhaka = (iso: string, withTime = true) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: withTime ? "2-digit" : "short", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}), timeZone: "Asia/Dhaka" }).format(new Date(iso));
const shortExp = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "2-digit", year: "2-digit" }).format(new Date(iso));

/** 80 mm thermal receipt or A4 invoice (design: "Receipt (80 mm)" and "Invoice (A4)"). Only the document prints. */
export default function ReceiptPage() {
  return (
    <RequireModule module="pos">
      <Suspense fallback={<PageLoader />}>
        <Receipt />
      </Suspense>
    </RequireModule>
  );
}

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [format, setFormat] = useState<"80mm" | "a4">(params.get("format") === "a4" ? "a4" : "80mm");
  const printed = useRef(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["admin", "receipt", id], queryFn: () => apiGet<ReceiptData>(`/admin/pos/receipts/${id}`) });

  // Straight from "Complete & print": print once as soon as the receipt is on screen.
  useEffect(() => {
    if (data && params.get("print") === "1" && !printed.current) {
      printed.current = true;
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [data, params]);

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Receipt not found." onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col items-center gap-5">
      <PageHeader
        title={`Receipt ${data.data.code}`}
        subtitle={`${data.data.customer?.name ?? "Walk-in customer"} · ${data.data.cashier?.name ?? ""}`}
        actions={
          <>
            <div className="segmented segmented-sm" role="radiogroup" aria-label="Paper">
              {(["80mm", "a4"] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? "segmented-option segmented-option-active" : "segmented-option"} onClick={() => setFormat(f)}>
                  {f === "80mm" ? "80 mm" : "A4"}
                </button>
              ))}
            </div>
            <Button variant="outline" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>
              Print
            </Button>
            <Link href="/admin/pos" className="btn-primary">
              <Plus size={18} aria-hidden="true" />
              New sale
            </Link>
          </>
        }
      />

      {format === "80mm" ? <Thermal r={data} /> : <Invoice r={data} />}
    </div>
  );
}

function Thermal({ r }: { r: ReceiptData }) {
  const o = r.data;
  const s = r.store;
  const discountPct = o.subtotal ? Math.round((o.discount_total / o.subtotal) * 100) : 0;

  return (
    <article className="receipt" aria-label={`Receipt ${o.code}`}>
      <header className="receipt-center">
        <div className="receipt-brand">YA RAHIM | يا رحيم</div>
        <div className="receipt-sub">PHARMACY</div>
        {clean(s.address) && <div>{s.address}</div>}
        <div>{[clean(s.phone), clean(s.drug_licence_no) && `DL ${s.drug_licence_no}`].filter(Boolean).join(" · ")}</div>
      </header>
      <div className="receipt-rule" />
      <div className="receipt-row">
        <span>Receipt: {o.code}</span>
      </div>
      <div className="receipt-row">
        <span>{dhaka(o.created_at)}</span>
        <span>{o.cashier?.name ? `Cashier: ${o.cashier.name.split(" ")[0]}` : ""}</span>
      </div>
      {o.customer && <div className="receipt-row">Customer: {o.customer.name}</div>}
      <div className="receipt-rule" />
      {o.items?.map((i) => (
        <div key={i.id} className="receipt-item">
          <div>{i.name}</div>
          <div className="receipt-row">
            <span>
              {i.quantity} x {money(i.unit_mrp)}
            </span>
            <span>{money(i.unit_mrp * i.quantity)}</span>
          </div>
        </div>
      ))}
      <div className="receipt-rule" />
      <div className="receipt-row">
        <span>Subtotal</span>
        <span>{money(o.subtotal)}</span>
      </div>
      {o.discount_total > 0 && (
        <div className="receipt-row">
          <span>Discount {discountPct}%</span>
          <span>-{money(o.discount_total)}</span>
        </div>
      )}
      <div className="receipt-row receipt-total">
        <span>TOTAL</span>
        <span>{money(o.total)}</span>
      </div>
      {o.payments?.map((p) => (
        <div key={p.id} className="flex flex-col">
          <div className="receipt-row">
            <span>{p.method_label}</span>
            <span>{money(p.received_amount ?? p.amount)}</span>
          </div>
          {!!p.change_amount && (
            <div className="receipt-row">
              <span>Change</span>
              <span>{money(p.change_amount)}</span>
            </div>
          )}
        </div>
      ))}
      {o.pharmacist && <div className="receipt-row">Rx released by {o.pharmacist.name}</div>}
      <div className="receipt-rule" />
      <footer className="receipt-center">{s.footer ?? "Thank you!"}</footer>
    </article>
  );
}

function Invoice({ r }: { r: ReceiptData }) {
  const o = r.data;
  const s = r.store;
  const discountPct = o.subtotal ? Math.round((o.discount_total / o.subtotal) * 100) : 0;
  const paid = (o.payments ?? []).reduce((sum, p) => sum + p.amount, 0);

  return (
    <article className="invoice" aria-label={`Invoice ${o.code}`}>
      <header className="invoice-head">
        <div className="flex flex-col gap-1">
          <div className="invoice-brand">Ya Rahim Pharmacy</div>
          {clean(s.address) && <div>{s.address}</div>}
          <div>{[clean(s.phone), clean(s.email)].filter(Boolean).join(" · ")}</div>
          <div>{[clean(s.drug_licence_no) && `Drug licence ${s.drug_licence_no}`, clean(s.tin_bin) && `BIN ${s.tin_bin}`].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="invoice-title">INVOICE</div>
          <div>
            No. <strong>{o.code}</strong>
          </div>
          <div>Date {dhaka(o.created_at, false)}</div>
        </div>
      </header>

      <section className="invoice-meta">
        <div>
          <div className="invoice-label">Bill to</div>
          <div className="font-medium">{o.customer?.name ?? "Walk-in customer"}</div>
          {o.customer?.phone && <div>{o.customer.phone}</div>}
        </div>
        <div>
          <div className="invoice-label">Payment</div>
          {o.payments?.map((p) => (
            <div key={p.id}>
              {p.method_label} {money(p.amount)}
              {p.transaction_id ? ` · ${p.transaction_id}` : ""}
            </div>
          ))}
          {o.cashier && <div>Served by {o.cashier.name}</div>}
        </div>
        {o.pharmacist && (
          <div>
            <div className="invoice-label">Rx verified by</div>
            <div>{o.pharmacist.name}</div>
            {o.pharmacist.registration_no && <div>Reg. {o.pharmacist.registration_no}</div>}
          </div>
        )}
      </section>

      <table className="invoice-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Medicine</th>
            <th scope="col">Batch / Exp</th>
            <th scope="col" className="text-right">
              Qty
            </th>
            <th scope="col" className="text-right">
              MRP
            </th>
            <th scope="col" className="text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {o.items?.map((i, n) => (
            <tr key={i.id}>
              <td>{n + 1}</td>
              <td>
                {i.name}
                {i.rx_required ? " (Rx)" : ""}
              </td>
              <td>{i.batch ? `${i.batch.batch_no} · ${shortExp(i.batch.expiry_date)}` : "—"}</td>
              <td className="text-right">{i.quantity_label ?? i.quantity}</td>
              <td className="text-right">{money(i.unit_mrp)}</td>
              <td className="text-right">{money(i.unit_mrp * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="invoice-totals">
        <dt>Subtotal</dt>
        <dd>{money(o.subtotal)}</dd>
        {o.discount_total > 0 && (
          <>
            <dt>Discount {discountPct}%</dt>
            <dd>-{money(o.discount_total)}</dd>
          </>
        )}
        <dt className="invoice-grand">Total (৳)</dt>
        <dd className="invoice-grand">{money(o.total)}</dd>
        <dt>Paid</dt>
        <dd>{money(paid)}</dd>
      </dl>

      <footer className="invoice-foot">
        <span>{s.footer ?? "Thank you for choosing Ya Rahim Pharmacy."}</span>
        <span>Medicines once sold are returned only as per pharmacy policy. Prices include VAT where applicable.</span>
      </footer>
    </article>
  );
}
