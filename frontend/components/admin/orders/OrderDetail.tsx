"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, FileText, Phone, Printer, Truck } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/Data";
import { TextareaField, TextField } from "@/components/ui/Field";
import { ErrorState, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { Link } from "@/i18n/navigation";
import { PAY_LABEL, type AdminOrder, type Rider } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime, phone, taka, timeAgo } from "@/lib/format";
import RxViewer from "./RxViewer";

const DELIVERY: Record<string, string> = { express: "Express delivery", standard: "Standard delivery", pickup: "Pickup at shop", counter: "Counter" };

const STATUS_TONE: Record<string, string> = {
  new: "order-tag-new",
  rx_verification: "order-tag-rx",
  packing: "order-tag-packing",
  ready_for_pickup: "order-tag-packing",
  out_for_delivery: "order-tag-transit",
  delivered: "order-tag-done",
  completed: "order-tag-done",
  cancelled: "order-tag-cancelled",
};

export function payLabel(o: Pick<AdminOrder, "payment_preference" | "payment_status" | "balance_due">) {
  const pref = PAY_LABEL[o.payment_preference ?? ""] ?? "Cash";
  if (o.payment_status === "paid" && o.payment_preference && !["cod", "pay_at_shop"].includes(o.payment_preference)) return `${pref} paid`;
  return o.payment_preference === "cod" ? "COD" : pref;
}

/** Right-hand side of the orders screen: one order, its prescription and the next step. */
export default function OrderDetail({ id, onChanged }: { id: number; onChanged: (o: AdminOrder) => void }) {
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const isPharmacist = can("rx", "full");
  const canManage = can("orders", "full");

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["admin", "order", id], queryFn: () => apiGet<{ data: AdminOrder }>(`/admin/orders/${id}`) });
  const order = data?.data;
  const needsRider = order ? ["express", "standard"].includes(order.delivery_type) : false;
  const ridersQuery = useQuery({
    queryKey: ["admin", "riders"],
    queryFn: () => apiGet<{ data: Rider[] }>("/admin/riders"),
    enabled: canManage && needsRider && !!order && ["rx_verification", "packing", "new"].includes(order.status),
    staleTime: 60_000,
  });

  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState("Prescription verified. Doctor’s name and date checked.");
  const [rider, setRider] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [collecting, setCollecting] = useState(false);

  if (isLoading) return <section className="panel items-center justify-center py-16"><Spinner /></section>;
  if (isError || !order) return <ErrorState message="Couldn’t load this order." onRetry={() => refetch()} />;

  const rxItems = (order.items ?? []).filter((i) => i.rx_required);
  const allRxChecked = rxItems.every((i) => checked[i.id] ?? i.rx_status === "approved");
  const customerName = order.customer?.name ?? order.recipient_name ?? "Customer";
  const tel = order.recipient_phone ?? order.customer?.phone;

  async function run(key: string, fn: () => Promise<{ data: AdminOrder }>, success: string) {
    setBusy(key);
    try {
      const res = await fn();
      queryClient.setQueryData(["admin", "order", id], { data: { ...order, ...res.data } });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["badges"] });
      toast.success(success);
      onChanged(res.data);
      return true;
    } catch (e) {
      toast.error((e as ApiError).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const assignRider = () =>
    apiSend<{ data: AdminOrder }>("post", `/admin/orders/${id}/assign-rider`, rider === "courier" ? { courier_name: "Courier partner" } : { rider_id: Number(rider) });

  async function approveRx() {
    const ok = await run("verify", () => apiSend("post", `/admin/orders/${id}/verify-rx`, { note: note.trim() || null }), "Prescription approved — sent to packing");
    if (ok && rider) await run("rider", assignRider, "Rider assigned");
  }

  const riderSelect = needsRider && canManage && (
    <select className="select order-rider" aria-label="Assign rider" value={rider} onChange={(e) => setRider(e.target.value)}>
      <option value="">Assign rider…</option>
      {ridersQuery.data?.data.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {r.active_deliveries ? ` · ${r.active_deliveries} on the way` : " · free"}
        </option>
      ))}
      <option value="courier">Courier partner</option>
    </select>
  );

  return (
    <section className="panel order-detail" aria-label={`Order ${order.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-xl font-bold">
            #{order.code} · {customerName}
          </h2>
          <span className="text-[13px] text-muted">
            Placed {timeAgo(order.placed_at ?? order.created_at)} · {DELIVERY[order.delivery_type] ?? order.delivery_type} · {payLabel(order)}
          </span>
        </div>
        <span className={`order-tag ${STATUS_TONE[order.status] ?? ""}`}>{order.status === "rx_verification" ? "Awaiting Rx verification" : order.status_label}</span>
      </div>

      <div className="flex flex-wrap gap-5">
        {order.requires_rx || order.prescription ? (
          <div className="min-w-0 flex-[1_1_260px]">
            <RxViewer rx={order.prescription} />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <h3 className="m-0 text-[15px] font-bold">{order.status === "rx_verification" ? "Check each item against the prescription" : "Items"}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {order.items?.map((i) => {
              const verifying = order.status === "rx_verification" && i.rx_required && isPharmacist;
              const ok = checked[i.id] ?? i.rx_status === "approved";
              const body = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                    <b className="font-medium">{i.name}</b>
                    <span className="text-xs text-muted">
                      {i.quantity_label ?? i.quantity}
                      {i.batch ? ` · Batch ${i.batch.batch_no}${i.batch.rack ? ` · Rack ${i.batch.rack}` : ""}` : ""} · {taka(i.line_total, locale)}
                    </span>
                  </span>
                  <span className={i.rx_required ? (ok ? "order-line-ok" : "order-line-check") : "order-line-otc"}>{i.rx_required ? (ok ? "Rx ✓" : "Rx — check") : "OTC"}</span>
                </>
              );
              return verifying ? (
                <li key={i.id}>
                  <label className="order-line cursor-pointer">
                    <input type="checkbox" className="checkbox mt-0.5" checked={ok} onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))} />
                    {body}
                  </label>
                </li>
              ) : (
                <li key={i.id} className="order-line">
                  {body}
                </li>
              );
            })}
          </ul>

          <dl className="order-sums">
            <dt>Subtotal</dt>
            <dd>{taka(order.subtotal, locale)}</dd>
            {order.discount_total > 0 && (
              <>
                <dt>Discount</dt>
                <dd>− {taka(order.discount_total, locale)}</dd>
              </>
            )}
            {order.delivery_fee > 0 && (
              <>
                <dt>Delivery</dt>
                <dd>{taka(order.delivery_fee, locale)}</dd>
              </>
            )}
            <dt className="font-bold text-ink">Total</dt>
            <dd className="font-bold">{taka(order.total, locale)}</dd>
            {order.balance_due > 0 && order.status !== "cancelled" && (
              <>
                <dt>To collect</dt>
                <dd className="font-medium text-accent-dark dark:text-accent-pale">{taka(order.balance_due, locale)}</dd>
              </>
            )}
          </dl>

          {order.status === "rx_verification" && isPharmacist && (
            <>
              <TextareaField label="Pharmacist note (sent to customer by SMS)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="text-[13px] text-muted">
                Verified by:{" "}
                <b className="text-ink">
                  {user?.name}
                  {user?.registration_no ? `, reg. ${user.registration_no}` : ""}
                </b>
              </div>
            </>
          )}
          {order.status === "rx_verification" && !isPharmacist && <p className="notice notice-warn m-0 text-sm">Waiting for a pharmacist to check the prescription.</p>}
          {order.prescription?.status === "rejected" && order.status === "rx_verification" && (
            <p className="notice notice-rx m-0 text-sm">Rejected: {order.prescription.reject_reason}. Waiting for the customer to send a new prescription.</p>
          )}

          <div className="flex flex-col gap-1 text-[13px] text-muted">
            {order.delivery_type !== "pickup" && order.delivery_address && (
              <span>
                Deliver to: <span className="text-ink">{[order.delivery_address, order.delivery_landmark, order.delivery_area?.name].filter(Boolean).join(", ")}</span>
              </span>
            )}
            {order.customer_note && <span>Customer note: <span className="text-ink">{order.customer_note}</span></span>}
            {order.delivery && (
              <span>
                <Truck size={14} className="inline align-[-2px]" aria-hidden="true" /> {order.delivery.rider?.name ?? order.delivery.courier_name} · {order.delivery.status.replace(/_/g, " ")}
                {order.delivery.cash_to_collect > 0 ? ` · collect ${taka(order.delivery.cash_to_collect, locale)}` : ""}
              </span>
            )}
            {order.cancel_reason && <span className="text-rx">Cancelled: {order.cancel_reason}</span>}
          </div>
        </div>
      </div>

      {/* Next step */}
      <div className="order-actions">
        {tel && (
          <a href={`tel:${tel}`} className="btn-outline">
            <Phone size={18} aria-hidden="true" />
            Call {phone(tel)}
          </a>
        )}
        {order.status === "rx_verification" && isPharmacist && (
          <button type="button" className="btn-outline order-reject" onClick={() => setRejecting(true)}>
            Reject — ask for new Rx
          </button>
        )}
        {canManage && ["new", "rx_verification", "packing", "ready_for_pickup"].includes(order.status) && (
          <Button variant="ghost" icon={<Ban size={18} aria-hidden="true" />} onClick={() => setCancelling(true)}>
            Cancel order
          </Button>
        )}
        <Link href={`/admin/pos/receipt/${order.id}?format=a4`} className="btn-ghost">
          <Printer size={18} aria-hidden="true" />
          Invoice
        </Link>
        <span className="flex-1" />

        {order.status === "rx_verification" && isPharmacist && (
          <>
            {riderSelect}
            <Button size="lg" loading={busy === "verify" || busy === "rider"} disabled={!allRxChecked || !order.prescription} onClick={approveRx} icon={<Check size={18} aria-hidden="true" />}>
              Approve &amp; send to packing
            </Button>
          </>
        )}
        {order.status === "new" && canManage && (
          <Button size="lg" loading={busy === "accept"} onClick={() => run("accept", () => apiSend("post", `/admin/orders/${id}/transition`, { status: "packing" }), "Order accepted — packing")}>
            Accept &amp; start packing
          </Button>
        )}
        {order.status === "packing" && canManage && needsRider && !order.delivery && (
          <>
            {riderSelect}
            <Button size="lg" loading={busy === "rider"} disabled={!rider} onClick={() => run("rider", assignRider, "Rider assigned")} icon={<Truck size={18} aria-hidden="true" />}>
              Assign rider
            </Button>
          </>
        )}
        {order.status === "packing" && canManage && order.delivery && <span className="text-sm text-muted">Waiting for {order.delivery.rider?.name ?? "the courier"} to pick up</span>}
        {order.status === "packing" && canManage && order.delivery_type === "pickup" && (
          <Button size="lg" loading={busy === "ready"} onClick={() => run("ready", () => apiSend("post", `/admin/orders/${id}/transition`, { status: "ready_for_pickup" }), "Customer notified — ready for pickup")}>
            Packed — ready for pickup
          </Button>
        )}
        {order.status === "ready_for_pickup" && can("pos") && (
          <Button size="lg" onClick={() => setCollecting(true)}>
            Customer collected · {order.balance_due > 0 ? `take ${taka(order.balance_due, locale)}` : "paid"}
          </Button>
        )}
        {order.status === "delivered" && canManage && (
          <Button size="lg" loading={busy === "complete"} disabled={order.balance_due > 0} onClick={() => run("complete", () => apiSend("post", `/admin/orders/${id}/transition`, { status: "completed" }), "Order completed")}>
            Mark completed
          </Button>
        )}
      </div>

      {order.history && order.history.length > 0 && (
        <details className="order-history">
          <summary>History</summary>
          <ol>
            {order.history.map((h, n) => (
              <li key={n}>
                <StatusDot status={h.to} label={h.to.replace(/_/g, " ")} />
                <span className="text-xs text-muted">
                  {dateTime(h.at, locale)}
                  {h.by ? ` · ${h.by}` : ""}
                  {h.note ? ` · ${h.note}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <ReasonDialog
        open={rejecting}
        title="Reject prescription"
        description="The customer gets an SMS asking for a clearer or valid prescription. The order stays open."
        label="Reason"
        placeholder="e.g. Doctor’s signature not visible"
        confirm="Reject prescription"
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => run("reject", () => apiSend("post", `/admin/orders/${id}/reject-rx`, { reason }), "Customer asked for a new prescription")}
      />
      <ReasonDialog
        open={cancelling}
        title={`Cancel ${order.code}?`}
        description="Reserved stock goes back on the shelf and the customer gets an SMS."
        label="Reason"
        placeholder="e.g. Customer asked to cancel"
        confirm="Cancel order"
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => run("cancel", () => apiSend("post", `/admin/orders/${id}/cancel`, { reason }), "Order cancelled")}
      />
      {collecting && (
        <CollectDialog
          order={order}
          onClose={() => setCollecting(false)}
          onCollect={(payments) => run("collect", () => apiSend("post", `/admin/orders/${id}/collect`, { payments }), "Order completed")}
        />
      )}
    </section>
  );
}

function ReasonDialog({ open, title, description, label, placeholder, confirm, onClose, onConfirm }: { open: boolean; title: string; description: string; label: string; placeholder: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <TextField label={label} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
        <Button
          variant="danger"
          loading={busy}
          disabled={reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            const ok = await onConfirm(reason.trim());
            setBusy(false);
            if (ok) {
              setReason("");
              onClose();
            }
          }}
        >
          {confirm}
        </Button>
      </div>
    </Modal>
  );
}

function CollectDialog({ order, onClose, onCollect }: { order: AdminOrder; onClose: () => void; onCollect: (payments: unknown[]) => Promise<boolean> }) {
  const locale = useLocale();
  const { feature } = useAuth();
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState(String(Math.ceil(order.balance_due)));
  const [txn, setTxn] = useState("");
  const [busy, setBusy] = useState(false);
  const due = order.balance_due;
  const methods = [
    ["cash", "Cash"],
    ["bkash", "bKash"],
    ["nagad", "Nagad"],
    ["card", "Card"],
  ].filter(([k]) => k === "cash" || feature(k));

  return (
    <Modal open onClose={onClose} title={`Hand over ${order.code}`} description={due > 0 ? `Collect ${taka(due, locale)} from the customer.` : "Already paid online — just hand it over."} size="sm">
      {due > 0 && (
        <>
          <div className="pos-methods">
            {methods.map(([k, l]) => (
              <label key={k} className={method === k ? "pos-method pos-method-active" : "pos-method"}>
                <input type="radio" name="collect-method" checked={method === k} onChange={() => setMethod(k)} />
                {l}
              </label>
            ))}
          </div>
          {method === "cash" ? (
            <TextField label="Cash received" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} hint={Number(received) > due ? `Change ${taka(Number(received) - due, locale)}` : undefined} />
          ) : (
            <TextField label="Transaction ID" value={txn} onChange={(e) => setTxn(e.target.value)} />
          )}
        </>
      )}
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
        <Button
          loading={busy}
          disabled={due > 0 && (method === "cash" ? Number(received) < due : !txn.trim())}
          icon={<FileText size={18} aria-hidden="true" />}
          onClick={async () => {
            setBusy(true);
            const ok = await onCollect(due > 0 ? [{ method, amount: due, received_amount: method === "cash" ? Number(received) : null, transaction_id: method === "cash" ? null : txn.trim() }] : []);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Complete
        </Button>
      </div>
    </Modal>
  );
}
