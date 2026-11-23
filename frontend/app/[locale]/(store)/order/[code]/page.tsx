"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Pill } from "lucide-react";
import { useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireCustomer } from "@/components/auth/Guards";
import { useToast } from "@/components/providers/ToastProvider";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import Button from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/Data";
import { ErrorState, Notice, PageLoader } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { Link } from "@/i18n/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime, taka } from "@/lib/format";
import type { Order, OrderStatusKey } from "@/lib/types";

export default function OrderPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<PageLoader />}>
        <OrderDetail />
      </Suspense>
    </RequireCustomer>
  );
}

const DELIVERY_STEPS: { key: OrderStatusKey; label: string }[] = [
  { key: "new", label: "Order placed" },
  { key: "rx_verification", label: "Prescription check" },
  { key: "packing", label: "Packing" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];
const PICKUP_STEPS: { key: OrderStatusKey; label: string }[] = [
  { key: "new", label: "Order placed" },
  { key: "rx_verification", label: "Prescription check" },
  { key: "packing", label: "Packing" },
  { key: "ready_for_pickup", label: "Ready for pickup" },
  { key: "completed", label: "Collected" },
];

function OrderDetail() {
  const { code } = useParams<{ code: string }>();
  const placed = useSearchParams().get("placed") === "1";
  const locale = useLocale();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["account", "order", code],
    queryFn: () => apiGet<{ data: Order }>(`/account/orders/${code}`),
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <div className="container-page py-12"><ErrorState message="We couldn’t find this order." onRetry={() => refetch()} /></div>;
  const o = data.data;

  const steps = (o.delivery_type === "pickup" ? PICKUP_STEPS : DELIVERY_STEPS).filter((s) => s.key !== "rx_verification" || o.requires_rx);
  const reachedIndex = (() => {
    if (o.status === "cancelled") return -1;
    const order: OrderStatusKey[] = ["new", "rx_verification", "packing", "ready_for_pickup", "out_for_delivery", "delivered", "completed"];
    const rank = order.indexOf(o.status === "completed" && o.delivery_type !== "pickup" ? "delivered" : o.status);
    return steps.reduce((acc, s, i) => (order.indexOf(s.key) <= rank ? i : acc), 0);
  })();
  const canCancel = o.status === "new" || o.status === "rx_verification";
  const rxRejected = o.prescription?.status === "rejected";

  async function cancel() {
    setBusy(true);
    try {
      await apiSend("post", `/account/orders/${code}/cancel`, { reason: reason || undefined });
      toast.success("Order cancelled");
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "My account", href: "/account" }, { label: `Order ${o.code}` }]} />

      {placed && o.status !== "cancelled" && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={32} aria-hidden="true" className="flex-none" />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-2xl">Thank you! Order {o.code} is placed.</h1>
            <p className="m-0">
              {o.requires_rx
                ? "Our pharmacist will check your prescription and call you to confirm before packing."
                : o.delivery_type === "pickup"
                  ? "We’ll SMS you when it’s ready at the counter. Show your order number when you come."
                  : "We’ll SMS you when it’s on the way."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          {!placed && <h1 className="m-0 text-3xl">Order {o.code}</h1>}
          <span className="text-sm text-muted">Placed {dateTime(o.placed_at ?? o.created_at, locale)}</span>
        </div>
        <StatusDot status={o.status} label={o.status_label} />
      </div>

      {/* Timeline */}
      {o.status === "cancelled" ? (
        <Notice tone="rx" title="This order was cancelled">{o.cancel_reason}</Notice>
      ) : (
        <ol className="timeline" aria-label="Order progress">
          {steps.map((s, i) => (
            <li key={s.key} className={i < reachedIndex ? "timeline-done" : i === reachedIndex ? "timeline-current" : ""} aria-current={i === reachedIndex ? "step" : undefined}>
              <span className="timeline-dot" aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {rxRejected && (
        <Notice tone="rx" title="Your prescription couldn’t be accepted">
          {o.prescription?.reject_reason} Please upload a clear photo of a valid prescription, or call us.
          <div className="mt-3">
            <Link href={`/upload-prescription`} className="btn-outline">
              Upload a new prescription
            </Link>
          </div>
        </Notice>
      )}

      {o.delivery?.otp_code && o.status === "out_for_delivery" && (
        <div className="otp-card">
          <KeyRound size={24} aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-medium">Delivery code</span>
            <span className="otp-code">{o.delivery.otp_code}</span>
            <span className="text-sm">Give this code to the rider only when you receive your order.</span>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card flex flex-col" aria-label="Items">
          {o.items?.map((i) => (
            <div key={i.id} className="cart-row">
              <span className="cart-thumb" aria-hidden="true">
                <Pill size={22} strokeWidth={1.5} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{i.name}</span>
                <span className="text-sm text-muted">{i.quantity_label}</span>
                {i.rx_required && <span className="text-xs font-bold text-rx">Rx {i.rx_status === "approved" ? "· verified" : ""}</span>}
              </div>
              <span className="font-medium">{taka(i.line_total, locale)}</span>
            </div>
          ))}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="card-pad flex flex-col gap-3">
            <h2 className="m-0 text-lg">Payment</h2>
            <dl className="summary-list">
              <dt>Subtotal (MRP)</dt>
              <dd>{taka(o.subtotal, locale)}</dd>
              <dt>Discount</dt>
              <dd>− {taka(o.discount_total, locale)}</dd>
              <dt>Delivery</dt>
              <dd>{o.delivery_type === "pickup" ? "Free" : taka(o.delivery_fee, locale)}</dd>
              <dt className="summary-total">Total</dt>
              <dd className="summary-total">{taka(o.total, locale)}</dd>
            </dl>
            <span className="text-sm text-muted">
              {o.payment_status === "paid" ? "Paid" : o.delivery_type === "pickup" ? "Pay at the shop counter" : "Cash on delivery"}
            </span>
          </section>
          <section className="card-pad flex flex-col gap-2 text-sm">
            <h2 className="m-0 text-lg">{o.delivery_type === "pickup" ? "Pickup" : "Delivery"}</h2>
            <span>
              {o.recipient_name} · {o.recipient_phone}
            </span>
            {o.delivery_address && (
              <span className="text-muted">
                {o.delivery_address}
                {o.delivery_landmark ? `, ${o.delivery_landmark}` : ""}
                {o.delivery_area ? ` — ${o.delivery_area.name}` : ""}
              </span>
            )}
            {o.delivery?.rider && <span>Rider: {o.delivery.rider.name}</span>}
          </section>
          {canCancel && (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this order?"
        description="The medicines go back on the shelf. You can order again any time."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              Cancel order
            </Button>
          </>
        }
      >
        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
