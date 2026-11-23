"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, Lock, Pill, Plus, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { RequireCustomer } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import Button from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, Notice, PageLoader } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { taka } from "@/lib/format";
import type { Address, DeliveryArea, Order, Prescription } from "@/lib/types";
import { useQuote } from "@/lib/useQuote";

type DeliveryChoice = "express" | "standard" | "pickup";
type PaymentChoice = "cash" | "pay_at_shop" | "bkash" | "nagad" | "card";

export default function CheckoutPage() {
  return (
    <RequireCustomer>
      <Checkout />
    </RequireCustomer>
  );
}

function Checkout() {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { lines, ready, clear } = useCart();

  const areas = useQuery({ queryKey: ["delivery-areas"], queryFn: () => apiGet<{ data: DeliveryArea[]; pickup_ready_minutes: number; express_hours: number }>("/store/delivery-areas") });
  const addresses = useQuery({ queryKey: ["account", "addresses"], queryFn: () => apiGet<{ data: Address[] }>("/account/addresses") });
  const prescriptions = useQuery({ queryKey: ["account", "prescriptions"], queryFn: () => apiGet<{ data: Prescription[] }>("/account/prescriptions") });

  const [delivery, setDelivery] = useState<DeliveryChoice>("standard");
  const [addressId, setAddressId] = useState<number | "new">("new");
  const [form, setForm] = useState({ recipient_name: "", recipient_phone: "", delivery_area_id: "", delivery_address: "", delivery_landmark: "" });
  const [saveAddress, setSaveAddress] = useState(true);
  const [payment, setPayment] = useState<PaymentChoice>("cash");
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [placing, setPlacing] = useState(false);

  // Defaults once data arrives: saved default address, the user's name and phone.
  useEffect(() => {
    const list = addresses.data?.data;
    if (list && list.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pick the default saved address once loaded
      setAddressId((list.find((a) => a.is_default) ?? list[0]).id);
    }
  }, [addresses.data]);
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill the contact details from the account
      setForm((f) => ({ ...f, recipient_name: f.recipient_name || user.name, recipient_phone: f.recipient_phone || (user.phone ?? "") }));
    }
  }, [user]);
  useEffect(() => {
    // Payment options depend on the delivery choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the payment choice valid
    if (delivery === "pickup" && payment === "cash") setPayment("pay_at_shop");
    if (delivery !== "pickup" && payment === "pay_at_shop") setPayment("cash");
  }, [delivery, payment]);

  const selectedAddress = typeof addressId === "number" ? addresses.data?.data.find((a) => a.id === addressId) : undefined;
  const areaId = delivery === "pickup" ? null : selectedAddress?.delivery_area_id ?? (form.delivery_area_id ? Number(form.delivery_area_id) : null);
  const { data: quote } = useQuote(lines, delivery, areaId);
  const area = areas.data?.data.find((a) => a.id === areaId);
  const usableRx = useMemo(() => (prescriptions.data?.data ?? []).filter((p) => p.status !== "rejected" && p.status !== "expired"), [prescriptions.data]);

  if (!ready || areas.isLoading || addresses.isLoading) return <PageLoader />;
  if (lines.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState title="Your cart is empty" action={<Link href="/medicines" className="btn-primary">Browse medicines</Link>} />
      </div>
    );
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    const body: Record<string, unknown> = {
      items: lines.map((l) => ({ medicine_id: l.medicine_id, pack_size_id: l.pack_size_id, quantity: l.quantity })),
      delivery_type: delivery,
      payment_method: payment,
      prescription_id: prescriptionId ?? undefined,
      customer_note: note || undefined,
    };
    if (delivery === "pickup") {
      body.recipient_name = form.recipient_name;
      body.recipient_phone = form.recipient_phone;
    } else if (selectedAddress) {
      body.address_id = selectedAddress.id;
    } else {
      Object.assign(body, form, { delivery_area_id: form.delivery_area_id ? Number(form.delivery_area_id) : undefined, save_address: saveAddress });
    }

    try {
      const res = await apiSend<{ data: Order }>("post", "/account/checkout", body);
      clear();
      queryClient.invalidateQueries({ queryKey: ["account"] });
      router.replace(`/order/${res.data.code}?placed=1`);
    } catch (e) {
      setError(e as ApiError);
      setPlacing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Why "Place order" is disabled, shown to the customer.
  const blocker = !quote
    ? "Checking prices…"
    : quote.problems.length > 0
      ? "Some items are short on stock — go back to the cart."
      : quote.requires_rx && !prescriptionId
        ? "Add your prescription to continue."
        : delivery !== "pickup" && !areaId
          ? "Choose your delivery area."
          : delivery !== "pickup" && quote.delivery_error
            ? quote.delivery_error
            : null;

  const fee = (a?: DeliveryArea, type?: DeliveryChoice) => {
    if (!a) return "Choose area";
    if (type === "express") return a.express_available && a.express_fee !== null ? taka(a.express_fee, locale) : "Not available";
    return taka(a.standard_fee, locale);
  };

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ol className="checkout-steps" aria-label="Checkout steps">
          <li className="checkout-step-done">
            <span aria-hidden="true">
              <Check size={14} />
            </span>
            Cart
          </li>
          <li aria-current="step" className="checkout-step-current">
            <span aria-hidden="true">2</span>Delivery &amp; payment
          </li>
          <li>
            <span aria-hidden="true">3</span>Confirmation
          </li>
        </ol>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Lock size={16} aria-hidden="true" />
          Secure checkout
        </span>
      </div>

      {error && <Notice tone="rx" title="We couldn’t place your order">{error.message}</Notice>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          {/* 1. Prescription */}
          {quote?.requires_rx && (
            <section className="card-pad flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-xl">1. Prescription</h2>
                <span className="badge-rx">Required for {quote.rx_item_count} item{quote.rx_item_count > 1 ? "s" : ""}</span>
              </div>
              <PrescriptionPicker items={usableRx} selected={prescriptionId} onSelect={setPrescriptionId} />
            </section>
          )}

          {/* 2. Delivery */}
          <section className="card-pad flex flex-col gap-5">
            <h2 className="m-0 text-xl">{quote?.requires_rx ? "2" : "1"}. How do you want it?</h2>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Delivery option">
              <DeliveryOption value="express" current={delivery} onChange={setDelivery} title="Express delivery" text={`Within ${areas.data?.express_hours ?? 2} hours${area ? ` in ${area.name}` : ""}`} price={fee(area, "express")} disabled={!!area && !area.express_available} />
              <DeliveryOption value="standard" current={delivery} onChange={setDelivery} title="Standard delivery" text="Same day" price={fee(area, "standard")} />
              <DeliveryOption value="pickup" current={delivery} onChange={setDelivery} title="Pick up in shop" text={`Ready in ${areas.data?.pickup_ready_minutes ?? 30} minutes`} price="Free" />
            </div>

            {delivery === "pickup" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Full name" autoComplete="name" required value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} error={error?.field("recipient_name")} />
                <TextField label="Mobile number" type="tel" autoComplete="tel" required value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} error={error?.field("recipient_phone")} />
              </div>
            ) : (
              <>
                {(addresses.data?.data.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-2" role="radiogroup" aria-label="Delivery address">
                    {addresses.data!.data.map((a) => (
                      <label key={a.id} className={`choice items-start ${addressId === a.id ? "choice-selected" : ""}`}>
                        <input type="radio" name="address" className="checkbox mt-0.5" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                        <span className="flex flex-col text-sm">
                          <span className="font-medium">
                            {a.label ?? "Address"} · {a.recipient_name}, {a.phone}
                          </span>
                          <span className="text-muted">
                            {a.address_line}
                            {a.landmark ? `, ${a.landmark}` : ""}
                            {a.delivery_area ? ` — ${a.delivery_area.name}` : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label className={`choice items-center ${addressId === "new" ? "choice-selected" : ""}`}>
                      <input type="radio" name="address" className="checkbox" checked={addressId === "new"} onChange={() => setAddressId("new")} />
                      <Plus size={16} aria-hidden="true" />
                      <span className="text-sm font-medium">Deliver to a new address</span>
                    </label>
                  </div>
                )}
                {addressId === "new" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Full name" autoComplete="name" required value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} error={error?.field("recipient_name")} />
                    <TextField label="Mobile number" type="tel" autoComplete="tel" required value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} error={error?.field("recipient_phone")} />
                    <SelectField label="Area" required value={form.delivery_area_id} onChange={(e) => setForm({ ...form, delivery_area_id: e.target.value })} error={error?.field("delivery_area_id")}>
                      <option value="">Select your area</option>
                      {areas.data?.data.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </SelectField>
                    <TextField label="House, road" autoComplete="street-address" required placeholder="e.g. House 12, Road 5" value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} error={error?.field("delivery_address")} />
                    <TextField label="Landmark (optional)" placeholder="e.g. near the mosque" value={form.delivery_landmark} onChange={(e) => setForm({ ...form, delivery_landmark: e.target.value })} />
                    <div className="flex items-end">
                      <Checkbox label="Save this address" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    </div>
                  </div>
                )}
              </>
            )}
            {quote?.delivery_error && delivery !== "pickup" && areaId && <Notice tone="warn">{quote.delivery_error}</Notice>}
          </section>

          {/* 3. Payment */}
          <section className="card-pad flex flex-col gap-4">
            <h2 className="m-0 text-xl">{quote?.requires_rx ? "3" : "2"}. Payment</h2>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
              {delivery !== "pickup" && <PayOption value="cash" current={payment} onChange={setPayment} title="Cash on delivery" />}
              {delivery === "pickup" && (
                <PayOption value="pay_at_shop" current={payment} onChange={setPayment} title="Pay at the shop" text="Pay at the counter — cash, bKash, Nagad or card. Items are kept aside for 24 hours." wide />
              )}
              {(["bkash", "nagad", "card"] as const).map((m) => (
                <PayOption key={m} value={m} current={payment} onChange={setPayment} title={m === "bkash" ? "bKash" : m === "nagad" ? "Nagad" : "Card"} text="Online payment launches soon" disabled />
              ))}
            </div>
            <p className="m-0 text-sm text-muted">
              For Rx orders, payment is collected only after our pharmacist confirms the items with you by phone.
              {delivery === "pickup" && " Show your order number at the counter."}
            </p>
            <TextField label="Note for us (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. call before coming" />
          </section>
        </div>

        {/* Summary */}
        <aside className="card-pad flex flex-col gap-4 lg:sticky lg:top-4" aria-label="Order summary">
          <h2 className="m-0 text-xl">Order summary</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {(quote?.lines ?? []).map((l) => (
              <li key={`${l.medicine_id}-${l.pack_size_id}`} className="summary-item">
                <span className="cart-thumb cart-thumb-sm" aria-hidden="true">
                  <Pill size={18} strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{l.name}</span>
                  <span className="text-xs text-muted">
                    {l.quantity} × {l.pack_name}
                  </span>
                  {l.rx_required && <span className="text-xs font-bold text-rx">Rx</span>}
                </span>
                <span className="text-sm font-medium">{taka(l.total, locale)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary-list">
            <dt>Subtotal (MRP)</dt>
            <dd>{taka(quote?.subtotal ?? 0, locale)}</dd>
            <dt>Discount</dt>
            <dd className="text-brand-dark dark:text-brand-line">− {taka(quote?.discount_total ?? 0, locale)}</dd>
            <dt>Delivery</dt>
            <dd>{delivery === "pickup" ? "Free" : areaId ? taka(quote?.delivery_fee ?? 0, locale) : "—"}</dd>
            <dt className="summary-total">Total</dt>
            <dd className="summary-total">{taka(quote?.total ?? 0, locale)}</dd>
          </dl>
          {blocker && <p className="m-0 text-sm text-muted">{blocker}</p>}
          <Button variant="accent" size="lg" block loading={placing} disabled={!!blocker} onClick={placeOrder}>
            Place order
          </Button>
          <p className="m-0 text-center text-xs text-muted">
            By placing the order you agree to our <Link href="/pages/terms">terms</Link> and <Link href="/pages/returns">return policy</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}

function DeliveryOption({ value, current, onChange, title, text, price, disabled }: { value: DeliveryChoice; current: DeliveryChoice; onChange: (v: DeliveryChoice) => void; title: string; text: string; price: string; disabled?: boolean }) {
  return (
    <label className={`choice flex-col gap-1.5 ${current === value ? "choice-selected" : ""} ${disabled ? "opacity-50" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        <input type="radio" name="delivery" className="checkbox" checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
      </span>
      <span className="text-sm text-muted">{text}</span>
      <span className="text-sm font-medium">{price}</span>
    </label>
  );
}

function PayOption({ value, current, onChange, title, text, disabled, wide }: { value: PaymentChoice; current: PaymentChoice; onChange: (v: PaymentChoice) => void; title: string; text?: string; disabled?: boolean; wide?: boolean }) {
  return (
    <label className={`choice items-start ${current === value ? "choice-selected" : ""} ${disabled ? "cursor-not-allowed opacity-60" : ""} ${wide ? "sm:col-span-2" : ""}`}>
      <input type="radio" name="payment" className="checkbox mt-0.5" checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {text && <span className="text-sm text-muted">{text}</span>}
      </span>
    </label>
  );
}

/** Choose a saved prescription or upload a new one (several pages allowed). */
function PrescriptionPicker({ items, selected, onSelect }: { items: Prescription[]; selected: number | null; onSelect: (id: number | null) => void }) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [saveForRefill, setSaveForRefill] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Preselect the newest prescription.
    if (selected === null && items.length) onSelect(items[0].id);
  }, [items, selected, onSelect]);

  async function upload() {
    setUploading(true);
    setError(null);
    const form = new FormData();
    files.forEach((f) => form.append("files[]", f));
    form.append("save_for_refill", saveForRefill ? "1" : "0");
    try {
      const res = await apiSend<{ data: Prescription }>("post", "/account/prescriptions", form);
      await queryClient.invalidateQueries({ queryKey: ["account", "prescriptions"] });
      setFiles([]);
      onSelect(res.data.id);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Prescription">
          {items.slice(0, 4).map((p) => (
            <label key={p.id} className={`choice items-center ${selected === p.id ? "choice-selected" : ""}`}>
              <input type="radio" name="rx" className="checkbox" checked={selected === p.id} onChange={() => onSelect(p.id)} />
              <FileUp size={18} aria-hidden="true" />
              <span className="flex flex-1 flex-col text-sm">
                <span className="font-medium">
                  Prescription #{p.id} · {p.pages?.length ?? 1} page{(p.pages?.length ?? 1) > 1 ? "s" : ""}
                </span>
                <span className="text-muted">
                  Uploaded {new Date(p.created_at).toLocaleDateString("en-GB")} · {p.status === "verified" ? "verified by pharmacist" : "waiting for check"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="dropzone dropzone-sm">
          <Plus size={18} aria-hidden="true" />
          {items.length ? "Upload a new prescription" : "Add prescription photo"}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5));
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {files.map((f, i) => (
                <li key={i} className="file-row">
                  <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                  <button type="button" className="btn-icon btn-ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <Checkbox label="Save this prescription for monthly refills and SMS reminders" checked={saveForRefill} onChange={(e) => setSaveForRefill(e.target.checked)} />
            <Button variant="outline" loading={uploading} onClick={upload}>
              Upload {files.length} page{files.length > 1 ? "s" : ""}
            </Button>
          </>
        )}
        {error && <Notice tone="rx">{error}</Notice>}
      </div>
    </div>
  );
}
