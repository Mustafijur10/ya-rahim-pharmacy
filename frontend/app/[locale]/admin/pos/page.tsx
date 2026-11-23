"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ScanBarcode, Search, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { CloseShiftDialog, OpenShiftCard } from "@/components/admin/ShiftDialogs";
import { RequireModule } from "@/components/auth/Guards";
import { ApprovalWaitDialog, CustomerDialog, HeldSalesDialog, type ApprovalAsk } from "@/components/pos/PosDialogs";
import { lineKey, toLine, type PosQuote, type PosResult } from "@/components/pos/pos-types";
import { usePosCart } from "@/components/pos/usePosCart";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import type { DrawerSummary } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { clock, phone, taka } from "@/lib/format";

type Shift = { id: number; counter_name: string; opened_at: string; opening_cash: string; summary: DrawerSummary };
type Method = "cash" | "bkash" | "nagad" | "card";
const METHODS: { key: Method; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "card", label: "Card" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
const monthYear = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso));

/** Counter register (design: "POS — New sale"). */
export default function PosPage() {
  return (
    <RequireModule module="pos">
      <Pos />
    </RequireModule>
  );
}

function Pos() {
  const shiftQuery = useQuery({ queryKey: ["admin", "shift", "current"], queryFn: () => apiGet<{ data: Shift | null }>("/admin/shifts/current") });

  if (shiftQuery.isLoading) return <PageLoader />;
  if (shiftQuery.isError) return <ErrorState message="Couldn’t load your shift." onRetry={() => shiftQuery.refetch()} />;
  const shift = shiftQuery.data?.data ?? null;

  if (!shift) {
    return (
      <>
        <PageHeader title="POS — New sale" subtitle="Open your shift to start selling" />
        <OpenShiftCard onOpened={() => shiftQuery.refetch()} />
      </>
    );
  }
  return <Register shift={shift} />;
}

function Register({ shift }: { shift: Shift }) {
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { feature } = useAuth();
  const cart = usePosCart();
  const searchRef = useRef<HTMLInputElement>(null);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [ask, setAsk] = useState<ApprovalAsk | null>(null);
  const [method, setMethod] = useState<Method>("cash");
  const [received, setReceived] = useState("");
  const [txn, setTxn] = useState("");
  const [busy, setBusy] = useState(false);
  const [discountText, setDiscountText] = useState(cart.discount ? String(cart.discount) : "");
  const approvals = useRef<{ discount?: number; rx_release?: number }>({});

  const methods = METHODS.filter((m) => m.key === "cash" || feature(m.key));

  /* ---- live total from the server (same FEFO batches + discount the sale uses) ---- */
  const items = cart.lines.map((l) => ({ medicine_id: l.medicine_id, quantity: l.quantity, pack_size_id: l.pack_size_id }));
  const quoteKey = JSON.stringify([items, cart.discount]);
  const [debouncedKey, setDebouncedKey] = useState(quoteKey);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedKey(quoteKey), 150);
    return () => clearTimeout(id);
  }, [quoteKey]);
  const quoteQuery = useQuery({
    queryKey: ["pos", "quote", debouncedKey],
    queryFn: () => {
      const [qItems, qDiscount] = JSON.parse(debouncedKey) as [typeof items, number];
      return apiSend<PosQuote>("post", "/admin/pos/quote", { items: qItems, discount_percent: qDiscount });
    },
    enabled: items.length > 0,
    placeholderData: (prev) => prev,
  });
  const quote = items.length ? quoteQuery.data : undefined;
  const stale = quoteQuery.isFetching || debouncedKey !== quoteKey;
  const total = quote?.total ?? 0;
  const maxDiscount = quote?.max_cashier_discount ?? 5;
  const receivedNum = Number(received.replace(/,/g, "")) || 0;
  const change = method === "cash" && receivedNum > total ? receivedNum - total : 0;
  const short = method === "cash" && received !== "" && receivedNum < total;
  const problems = quote?.problems ?? [];

  const heldQuery = useQuery({ queryKey: ["pos", "held"], queryFn: () => apiGet<{ data: unknown[] }>("/admin/pos/held") });
  const heldCount = heldQuery.data?.data.length ?? 0;

  const resetPayment = () => {
    setReceived("");
    setTxn("");
    setMethod("cash");
    setDiscountText("");
    approvals.current = {};
  };

  /* ---- complete the sale ---- */
  const complete = useCallback(async () => {
    if (!cart.lines.length || busy) return;
    if (stale || !quote) {
      toast.toast({ tone: "info", title: "Updating total…", description: "Try again in a moment." });
      return;
    }
    if (problems.length) {
      toast.error("Some items don’t have enough stock.");
      return;
    }
    if (short) {
      toast.error("Cash received is less than the total.");
      return;
    }
    if (method !== "cash" && !txn.trim()) {
      toast.error("Enter the transaction ID.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiSend<{ data: { id: number; code: string } }>("post", "/admin/pos/sales", {
        items,
        customer_id: cart.customer?.id ?? null,
        discount_percent: cart.discount,
        discount_approval_id: approvals.current.discount ?? null,
        rx_approval_id: approvals.current.rx_release ?? null,
        held_sale_id: cart.heldSaleId,
        payments: [{ method, amount: total, received_amount: method === "cash" ? (received ? receivedNum : total) : null, transaction_id: method === "cash" ? null : txn.trim() }],
      });
      cart.clear();
      resetPayment();
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      router.push(`/admin/pos/receipt/${res.data.id}?print=1`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "approval_required") {
        const type = err.context.approval_type as ApprovalAsk["type"];
        setAsk({
          type,
          amount: type === "discount" ? cart.discount : undefined,
          medicines: cart.lines.filter((l) => l.rx_required).map((l) => l.name),
          customer: cart.customer?.name,
        });
      } else {
        if (err.code === "shift_closed") queryClient.invalidateQueries({ queryKey: ["admin", "shift"] });
        toast.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  }, [cart, busy, stale, quote, problems.length, short, method, txn, items, total, received, receivedNum, toast, queryClient, router]);

  // Once an approval arrives the sale continues by itself.
  const completeRef = useRef(complete);
  useEffect(() => {
    completeRef.current = complete;
  }, [complete]);
  const onApproved = useCallback((type: ApprovalAsk["type"], id: number) => {
    approvals.current[type] = id;
    setTimeout(() => {
      setAsk(null);
      completeRef.current();
    }, 600);
  }, []);

  /* ---- hold ---- */
  const hold = useCallback(async () => {
    if (!cart.lines.length) return;
    try {
      await apiSend("post", "/admin/pos/held", { cart: cart.toHeld(), customer_id: cart.customer?.id ?? null, label: cart.customer?.name ?? null });
      cart.clear();
      resetPayment();
      heldQuery.refetch();
      toast.success("Sale held", "Resume it from Held sales.");
      searchRef.current?.focus();
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  }, [cart, heldQuery, toast]);

  /* ---- keyboard: F2 search · F4 customer · F8 hold · F10 pay ---- */
  const keys = useRef({ hold, complete });
  useEffect(() => {
    keys.current = { hold, complete };
  }, [hold, complete]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        setCustomerOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        keys.current.hold();
      } else if (e.key === "F10") {
        e.preventDefault();
        keys.current.complete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lineQuote = (medicineId: number, packId: number | null) => quote?.lines.find((l) => l.medicine_id === medicineId && l.pack_size_id === packId);

  return (
    <>
      <PageHeader
        title="POS — New sale"
        subtitle={`${shift.counter_name} · Shift opened ${clock(shift.opened_at)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setHeldOpen(true)}>
              Held sales ({heldCount})
            </Button>
            <Link href="/admin/returns" className="btn-outline hidden md:inline-flex">
              Return / exchange
            </Link>
            <Button variant="outline" className="hidden md:inline-flex" onClick={() => setClosing(true)}>
              Close shift
            </Button>
          </>
        }
      />

      <div className="pos-layout">
        <PosSearch inputRef={searchRef} onAdd={(r) => cart.add(toLine(r))} />

        <section className="pos-card pos-cart" aria-label="Current sale">
          <div className="pos-customer">
            <span className="avatar">{cart.customer ? initials(cart.customer.name) : "W"}</span>
            <span className="flex min-w-0 flex-1 flex-col text-sm">
              <b className="truncate">{cart.customer?.name ?? "Walk-in customer"}</b>
              <span className="truncate text-xs text-muted">
                {cart.customer ? `${phone(cart.customer.phone)} · ${cart.customer.orders_count ?? 0} past purchases` : "Press F4 to add a customer"}
              </span>
            </span>
            <button type="button" className="link-button text-sm" onClick={() => setCustomerOpen(true)}>
              {cart.customer ? "Change" : "Add"}
            </button>
          </div>

          {cart.lines.length === 0 ? (
            <p className="pos-empty m-0">
              <ScanBarcode size={28} aria-hidden="true" />
              Cart is empty — scan or search a medicine
            </p>
          ) : (
            <ul className="pos-lines">
              {cart.lines.map((l) => {
                const key = lineKey(l);
                const q = lineQuote(l.medicine_id, l.pack_size_id);
                const problem = problems.find((p) => p.medicine_id === l.medicine_id);
                const each = l.unit_mrp * l.pack_units;
                return (
                  <li key={key} className="pos-line">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {l.name}
                        {l.rx_required && <span className="badge-rx">Rx</span>}
                      </b>
                      <span className="text-xs text-muted">
                        {l.batch_no ? `Batch ${l.batch_no} · ` : ""}
                        {taka(each, locale)} each
                        {l.packs.length > 1 && (
                          <select className="pos-pack" aria-label={`Pack for ${l.name}`} value={l.pack_size_id ?? ""} onChange={(e) => cart.setPack(key, Number(e.target.value))}>
                            {l.packs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                      {problem && <span className="field-error">{problem.message}</span>}
                    </div>
                    <div className="pos-qty" role="group" aria-label={`Quantity of ${l.name}`}>
                      <button type="button" aria-label={l.quantity === 1 ? `Remove ${l.name}` : "Decrease"} onClick={() => cart.setQuantity(key, l.quantity - 1)}>
                        <Minus size={16} aria-hidden="true" />
                      </button>
                      <input
                        inputMode="numeric"
                        aria-label="Quantity"
                        value={l.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ""));
                          if (n > 0) cart.setQuantity(key, n);
                        }}
                      />
                      <button type="button" aria-label="Increase" onClick={() => cart.setQuantity(key, l.quantity + 1)}>
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <span className="pos-line-total">{taka(q ? q.total : each * l.quantity, locale)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="pos-discount">
            <label htmlFor="pos-discount">Discount %</label>
            <input
              id="pos-discount"
              className="input"
              inputMode="decimal"
              value={discountText}
              placeholder="0"
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setDiscountText(v);
                cart.setDiscount(Number(v) || 0);
                approvals.current.discount = undefined;
              }}
            />
            <span className={cart.discount > maxDiscount ? "text-xs text-pending" : "text-xs text-muted"}>
              {cart.discount > maxDiscount ? "Manager will be asked" : `Up to ${maxDiscount}% without approval`}
            </span>
          </div>

          <dl className="pos-summary">
            <dt>Subtotal (MRP)</dt>
            <dd>{taka(quote?.subtotal ?? 0, locale)}</dd>
            <dt>Discount{cart.discount ? ` ${cart.discount}%` : ""}</dt>
            <dd className="text-brand-dark dark:text-brand-line">− {taka(quote?.discount_total ?? 0, locale)}</dd>
            <dt className="pos-summary-total">Total</dt>
            <dd className="pos-summary-total" aria-live="polite">
              {taka(total, locale)}
            </dd>
          </dl>
          {quote?.requires_rx && <p className="notice notice-rx m-0 text-sm">Prescription medicine in this sale — a pharmacist releases it.</p>}

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-medium">Payment method</legend>
            <div className="pos-methods">
              {methods.map((m) => (
                <label key={m.key} className={method === m.key ? "pos-method pos-method-active" : "pos-method"}>
                  <input type="radio" name="pos-method" checked={method === m.key} onChange={() => setMethod(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          {method === "cash" ? (
            <div className="grid grid-cols-2 gap-2.5">
              <label className="pos-money-label">
                Received
                <input className={short ? "pos-money pos-money-invalid" : "pos-money"} inputMode="numeric" value={received} placeholder={total ? String(Math.ceil(total)) : "0"} onChange={(e) => setReceived(e.target.value.replace(/[^\d.,]/g, ""))} />
              </label>
              <div className="pos-money-label">
                Change
                <span className="pos-change">{taka(change, locale)}</span>
              </div>
            </div>
          ) : (
            <label className="pos-money-label">
              Transaction ID
              <input className="pos-money" value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="e.g. 9JK2LM4P" />
            </label>
          )}

          <div className="flex gap-2.5">
            <button type="button" className="pos-hold" onClick={hold} disabled={!cart.lines.length}>
              Hold
            </button>
            <Button size="lg" className="pos-complete" loading={busy} disabled={!cart.lines.length || problems.length > 0} onClick={complete}>
              Complete sale & print receipt
            </Button>
          </div>
          {cart.lines.length > 0 && (
            <button
              type="button"
              className="link-button self-center text-sm text-muted"
              onClick={() => {
                cart.clear();
                resetPayment();
              }}
            >
              <X size={14} aria-hidden="true" /> Clear sale
            </button>
          )}
        </section>
      </div>

      <CustomerDialog open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={cart.setCustomer} />
      <HeldSalesDialog
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        onResume={(c, id) => {
          cart.resume(c, id);
          setDiscountText(c.discount_percent ? String(c.discount_percent) : "");
          heldQuery.refetch();
        }}
      />
      <CloseShiftDialog shiftId={shift.id} drawer={shift.summary} open={closing} onClose={() => setClosing(false)} />
      {ask && <ApprovalWaitDialog key={`${ask.type}-${ask.amount}`} ask={ask} onClose={() => setAsk(null)} onApproved={onApproved} />}
    </>
  );
}

/* ---------------- Search & barcode (left card) ---------------- */
function PosSearch({ inputRef, onAdd }: { inputRef: React.RefObject<HTMLInputElement | null>; onAdd: (r: PosResult) => void }) {
  const locale = useLocale();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 180);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["pos", "search", term],
    queryFn: () => apiGet<{ data: PosResult[] }>("/admin/pos/search", { q: term }),
    enabled: term.length >= 2,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
  const results = term.length >= 2 ? (data?.data ?? []) : [];

  function pick(r: PosResult | undefined, clear = false) {
    if (!r) return;
    if (!r.next_batch) {
      toast.error(`${r.name} is out of stock.`);
      return;
    }
    onAdd(r);
    if (clear) {
      setQ("");
      setTerm("");
      setActive(0);
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function onEnter() {
    const value = q.trim();
    if (!value) return;
    // Scanners type the code then Enter — look it up at once instead of waiting for the debounce.
    if (/^\d{6,}$/.test(value)) {
      try {
        const res = await apiGet<{ data: PosResult[] }>("/admin/pos/search", { q: value });
        const hit = res.data.find((r) => r.barcode === value);
        if (hit) return pick(hit, true);
        if (res.data.length === 0) {
          toast.error("No medicine with this barcode.");
          return;
        }
      } catch (e) {
        toast.error((e as ApiError).message);
        return;
      }
    }
    pick(results[active]);
  }

  return (
    <section className="pos-card" aria-label="Find medicine">
      <div className="flex flex-wrap gap-2.5">
        <div className="pos-search">
          <Search size={20} aria-hidden="true" />
          <label htmlFor="pos-q" className="sr-only">
            Search medicine
          </label>
          <input
            id="pos-q"
            ref={inputRef}
            autoFocus
            autoComplete="off"
            placeholder="Brand, generic or barcode"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              } else if (e.key === "Escape") {
                setQ("");
              }
            }}
          />
          {isFetching ? <span className="spin" aria-hidden="true" /> : <kbd className="kbd">F2</kbd>}
        </div>
        <button
          type="button"
          className="pos-scan"
          onClick={() => {
            setQ("");
            inputRef.current?.focus();
            toast.toast({ tone: "info", title: "Ready to scan", description: "Scan the barcode now." });
          }}
        >
          <ScanBarcode size={18} aria-hidden="true" />
          Scan barcode
        </button>
      </div>

      <p className="m-0 text-[13px] text-muted" aria-live="polite">
        {term.length < 2
          ? "Type 2 or more letters, or scan. Oldest-expiry batch is picked first (FEFO)."
          : `${results.length} result${results.length === 1 ? "" : "s"} for “${term}” — brand and generic. Oldest-expiry batch is picked first (FEFO).`}
      </p>

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="pos-results">
            <thead>
              <tr>
                <th scope="col">Medicine</th>
                <th scope="col">Batch · Expiry</th>
                <th scope="col">Rack</th>
                <th scope="col">Stock</th>
                <th scope="col">Price</th>
                <th scope="col">
                  <span className="sr-only">Add</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const pack = r.pack_sizes.find((p) => p.is_default) ?? r.pack_sizes[0];
                return (
                  <tr key={r.id} className={i === active ? "pos-result-active" : undefined} onMouseEnter={() => setActive(i)}>
                    <td>
                      <div className="flex flex-col">
                        <b className="flex flex-wrap items-center gap-1.5 font-medium">
                          {r.name}
                          {r.rx_required && <span className="badge-rx">Rx</span>}
                          {r.is_cold_chain && <span className="badge-neutral">Fridge</span>}
                        </b>
                        <span className="pos-generic">{[r.generic, r.company].filter(Boolean).join(" · ")}</span>
                      </div>
                    </td>
                    <td className="text-[13px]">
                      {r.next_batch ? (
                        <>
                          {r.next_batch.batch_no} · <span className={`pos-exp-${r.next_batch.expiry_level}`}>{monthYear(r.next_batch.expiry_date)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-[13px]">{r.next_batch?.rack ?? "—"}</td>
                    <td className="text-[13px]">
                      {r.next_batch ? <span className={r.low_stock ? "text-pending" : undefined}>{`${r.stock_packs} ${pack?.short_name ?? "units"}`}</span> : <span className="badge-warn">Out of stock</span>}
                    </td>
                    <td className="font-medium">{pack?.mrp != null ? taka(pack.mrp, locale) : "—"}</td>
                    <td className="text-right">
                      <button type="button" className="pos-add" aria-label={`Add ${r.name}`} disabled={!r.next_batch} onClick={() => pick(r)}>
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="pos-key">F2 Search</span>
        <span className="pos-key">F4 Customer</span>
        <span className="pos-key">F8 Hold</span>
        <span className="pos-key">F10 Pay</span>
      </div>
    </section>
  );
}
