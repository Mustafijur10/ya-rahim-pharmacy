"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanBarcode, Tag, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { PageButtons } from "@/components/admin/stock/StockBits";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, PageLoader, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { pageInfo, type Paged, type References } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { date, taka, todayIso } from "@/lib/format";

type PackOpt = { id: number; short_name: string; units: number; is_default: boolean };
type Line = {
  key: string;
  medicine_id: number;
  name: string;
  packs: PackOpt[];
  unit_name: string;
  rack: string | null;
  batch_no: string;
  expiry: string; // YYYY-MM
  qty: string;
  pack_id: number;
  cost: string; // per selling pack
  mrp: string; // per selling pack
};
type MedHit = { id: number; name: string; strength: string | null; dosage_form: string | null; barcode: string | null };
type MedFull = { id: number; name: string; strength: string | null; dosage_form: string | null; unit_name: string; default_rack: string | null; default_cost: number | null; default_mrp: number | null; pack_sizes: PackOpt[] };
type PurchaseRow = { id: number; code: string; invoice_no: string | null; purchased_at: string; total: string; paid: string; items_count: number; supplier: { id: number; name: string } | null; creator: { name: string } | null };

const DRAFT_KEY = "yr-purchase-draft";
const DRAFT_EVENT = "yr-purchase-draft";
const subscribeDraft = (cb: () => void) => {
  window.addEventListener(DRAFT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(DRAFT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const setDraft = (value: string | null) => {
  if (value === null) localStorage.removeItem(DRAFT_KEY);
  else localStorage.setItem(DRAFT_KEY, value);
  window.dispatchEvent(new Event(DRAFT_EVENT));
};
const sellPack = (l: Line) => l.packs.find((p) => p.is_default) ?? l.packs[0] ?? { id: 0, short_name: "unit", units: 1, is_default: true };
const lineUnits = (l: Line) => (Number(l.qty) || 0) * (l.packs.find((p) => p.id === l.pack_id)?.units ?? 1);
const lineSellPacks = (l: Line) => lineUnits(l) / (sellPack(l).units || 1);
const lineTotal = (l: Line) => +(lineSellPacks(l) * (Number(l.cost) || 0)).toFixed(2);
const endOfMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const fullName = (m: { name: string; strength: string | null; dosage_form: string | null }) => [m.name, m.strength, m.dosage_form].filter(Boolean).join(" ");

export default function PurchasesPage() {
  return (
    <RequireModule module="purchases">
      <Suspense fallback={<PageLoader />}>
        <Purchases />
      </Suspense>
    </RequireModule>
  );
}

function Purchases() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get("view") === "history" ? "history" : "new";
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={view === "history" ? "Purchase history" : "New purchase entry"}
        subtitle={view === "history" ? "Everything received from suppliers" : "Stock received from supplier — added to inventory by batch & expiry"}
        actions={
          <button type="button" className="btn-outline" onClick={() => router.replace(view === "history" ? pathname : `${pathname}?view=history`, { scroll: false })}>
            {view === "history" ? "New purchase entry" : "Purchase history"}
          </button>
        }
      />
      {view === "history" ? <History onOpen={setOpen} /> : <Entry onOpen={setOpen} />}
      <PurchaseDetail id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ---------------- New purchase entry ---------------- */
function Entry({ onOpen }: { onOpen: (id: number) => void }) {
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const recent = useQuery({ queryKey: ["admin", "purchases", "recent"], queryFn: () => apiGet<Paged<PurchaseRow>>("/admin/purchases") });

  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const hasDraft = useSyncExternalStore(subscribeDraft, () => localStorage.getItem(DRAFT_KEY) !== null, () => false);

  const itemsTotal = +lines.reduce((s, l) => s + lineTotal(l), 0).toFixed(2);
  const payable = Math.max(0, +(itemsTotal - (Number(discount) || 0)).toFixed(2));
  const paidNum = Math.min(payable, Number(paid) || 0);
  const due = +(payable - paidNum).toFixed(2);

  async function addMedicine(id: number) {
    try {
      const { data: m } = await apiGet<{ data: MedFull }>(`/admin/medicines/${id}`);
      const def = m.pack_sizes.find((p) => p.is_default) ?? m.pack_sizes[0];
      const per = def?.units ?? 1;
      setLines((ls) => [
        ...ls,
        {
          key: `${id}-${Date.now()}`,
          medicine_id: id,
          name: fullName(m),
          packs: m.pack_sizes.length ? m.pack_sizes : [{ id: 0, short_name: m.unit_name, units: 1, is_default: true }],
          unit_name: m.unit_name,
          rack: m.default_rack,
          batch_no: "",
          expiry: "",
          qty: "",
          pack_id: (m.pack_sizes.slice().sort((a, b) => b.units - a.units)[0] ?? def)?.id ?? 0,
          cost: m.default_cost != null ? String(+(m.default_cost * per).toFixed(2)) : "",
          mrp: m.default_mrp != null ? String(+(m.default_mrp * per).toFixed(2)) : "",
        },
      ]);
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function saveDraft() {
    setDraft(JSON.stringify({ supplier, invoice, invoiceDate, lines, discount, paid, method }));
    toast.success("Draft saved on this computer");
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
      setSupplier(d.supplier ?? "");
      setInvoice(d.invoice ?? "");
      setInvoiceDate(d.invoiceDate ?? todayIso());
      setLines(d.lines ?? []);
      setDiscount(d.discount ?? "");
      setPaid(d.paid ?? "");
      setMethod(d.method ?? "cash");
    } catch {
      /* ignore a broken draft */
    }
  }

  async function submit() {
    const bad = lines.find((l) => !l.batch_no.trim() || !l.expiry || !(Number(l.qty) > 0) || !(Number(l.cost) >= 0) || !(Number(l.mrp) > 0));
    if (!supplier) return toast.error("Choose the supplier.");
    if (!lines.length) return toast.error("Add at least one item.");
    if (bad) return toast.error(`Fill batch, expiry, quantity, cost and MRP for ${bad.name}.`);
    setBusy(true);
    try {
      const res = await apiSend<{ data: { id: number; code: string } }>("post", "/admin/purchases", {
        supplier_id: Number(supplier),
        invoice_no: invoice.trim() || null,
        purchased_at: invoiceDate,
        discount: Number(discount) || 0,
        paid: paidNum,
        payment_method: method,
        items: lines.map((l) => {
          const per = sellPack(l).units || 1;
          return {
            medicine_id: l.medicine_id,
            batch_no: l.batch_no.trim().toUpperCase(),
            expiry_date: endOfMonth(l.expiry),
            quantity: lineUnits(l),
            unit_cost: +(Number(l.cost) / per).toFixed(4),
            mrp: +(Number(l.mrp) / per).toFixed(4),
            rack: l.rack,
          };
        }),
      });
      toast.success(`Purchase ${res.data.code} saved`, "Stock is now available in the shop and online.");
      setDraft(null);
      setLines([]);
      setInvoice("");
      setDiscount("");
      setPaid("");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      onOpen(res.data.id);
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-layout">
      <div className="flex min-w-0 flex-col gap-5">
        {hasDraft && !lines.length && (
          <div className="notice notice-brand flex flex-wrap items-center justify-between gap-3 text-sm">
            You have a saved draft on this computer.
            <span className="flex gap-2">
              <Button variant="outline" onClick={loadDraft}>
                Open draft
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                }}
              >
                Discard
              </Button>
            </span>
          </div>
        )}
        <section className="panel">
          <h2 className="panel-title">Purchase details</h2>
          <div className="form-grid form-grid-4">
            <SelectField label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">— Choose —</option>
              {refs.data?.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Invoice no." value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            <TextField label="Invoice date" type="date" max={todayIso()} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            <TextField label="Received by" value={user?.name ?? ""} readOnly />
          </div>
          {refs.data && refs.data.suppliers.length === 0 && (
            <p className="m-0 text-sm text-muted">
              No suppliers yet — <Link href="/admin/suppliers">add one first</Link>.
            </p>
          )}
        </section>

        <section className="panel p-0!">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="panel-title">Items received</h2>
            <MedicinePicker onPick={addMedicine} />
          </div>
          {lines.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="No items yet" description="Search a medicine or scan the box barcode to add it." icon={<ScanBarcode size={24} aria-hidden="true" />} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table purchase-table min-w-[980px]">
                <thead>
                  <tr>
                    <th scope="col">Medicine</th>
                    <th scope="col">Batch no.</th>
                    <th scope="col">Expiry</th>
                    <th scope="col">Qty received</th>
                    <th scope="col">Cost</th>
                    <th scope="col">MRP</th>
                    <th scope="col" className="text-right">
                      Line total
                    </th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const sp = sellPack(l);
                    const tooLow = Number(l.mrp) > 0 && Number(l.cost) > Number(l.mrp);
                    return (
                      <tr key={l.key}>
                        <td className="font-medium">{l.name}</td>
                        <td>
                          <input className="input w-28 uppercase" aria-label={`Batch for ${l.name}`} value={l.batch_no} onChange={(e) => update(l.key, { batch_no: e.target.value })} />
                        </td>
                        <td>
                          <input className="input w-36" type="month" aria-label={`Expiry for ${l.name}`} min={todayIso().slice(0, 7)} value={l.expiry} onChange={(e) => update(l.key, { expiry: e.target.value })} />
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <input className="input w-20" inputMode="numeric" aria-label={`Quantity of ${l.name}`} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value.replace(/\D/g, "") })} />
                            <select className="select w-auto" aria-label="Pack" value={l.pack_id} onChange={(e) => update(l.key, { pack_id: Number(e.target.value) })}>
                              {l.packs.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.short_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {lineUnits(l) > 0 && (
                            <span className="text-xs text-muted">
                              = {+lineSellPacks(l).toFixed(1)} {sp.short_name}s
                            </span>
                          )}
                        </td>
                        <td>
                          <input className={tooLow ? "input input-invalid w-24" : "input w-24"} inputMode="decimal" aria-label={`Cost per ${sp.short_name}`} value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value.replace(/[^\d.]/g, "") })} />
                          <span className="block text-xs text-muted">per {sp.short_name}</span>
                        </td>
                        <td>
                          <input className="input w-24" inputMode="decimal" aria-label={`MRP per ${sp.short_name}`} value={l.mrp} onChange={(e) => update(l.key, { mrp: e.target.value.replace(/[^\d.]/g, "") })} />
                          <span className="block text-xs text-muted">per {sp.short_name}</span>
                        </td>
                        <td className="text-right font-medium tabular-nums">{taka(lineTotal(l), locale)}</td>
                        <td>
                          <button type="button" className="btn-icon btn-ghost" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        <section className="panel">
          <h2 className="panel-title">Total</h2>
          <dl className="order-sums">
            <dt>Items total</dt>
            <dd>{taka(itemsTotal, locale)}</dd>
            <dt>Discount from supplier</dt>
            <dd>
              <input className="input h-9 w-28 text-right" inputMode="decimal" aria-label="Discount from supplier" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} />
            </dd>
            <dt>VAT</dt>
            <dd>Included</dd>
            <dt className="pt-2 text-base font-bold text-ink">Payable</dt>
            <dd className="pt-2 text-base font-bold">{taka(payable, locale)}</dd>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Paid now" inputMode="decimal" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))} />
            <SelectField label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank transfer</option>
              <option value="bkash">bKash</option>
              <option value="cheque">Cheque</option>
            </SelectField>
          </div>
          {due > 0 && payable > 0 && <p className="notice notice-warn m-0 text-sm">{taka(due, locale)} will be added to the supplier’s due balance.</p>}
          <Button size="lg" block loading={busy} onClick={submit}>
            Save &amp; add to stock
          </Button>
          <Button variant="outline" block disabled={!lines.length} onClick={saveDraft}>
            Save as draft
          </Button>
        </section>

        <section className="panel">
          <h2 className="panel-title">Recent purchases</h2>
          {recent.isLoading ? (
            <Spinner />
          ) : (
            <ul className="list-rows">
              {recent.data?.data.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button type="button" className="link-button flex min-w-0 flex-col items-start text-left" onClick={() => onOpen(p.id)}>
                    <span className="font-medium text-ink">{p.supplier?.name ?? "Supplier"}</span>
                    <span className="text-xs text-muted">
                      {date(p.purchased_at, locale)} · {p.invoice_no || p.code}
                    </span>
                  </button>
                  <b className="text-sm">{taka(Number(p.total), locale)}</b>
                </li>
              ))}
              {recent.data?.data.length === 0 && <li className="text-sm text-muted">No purchases yet.</li>}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

/** Search box + barcode scan for adding a medicine to the purchase. */
function MedicinePicker({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({ queryKey: ["admin", "medicines", "pick", term], queryFn: () => apiGet<Paged<MedHit>>("/admin/medicines", { search: term }), enabled: term.length >= 2 });
  const hits = term.length >= 2 ? (data?.data ?? []).slice(0, 8) : [];

  function pick(id: number) {
    onPick(id);
    setQ("");
    setTerm("");
  }

  return (
    <div className="relative w-full max-w-sm">
      <div className="order-search w-full">
        <ScanBarcode size={18} aria-hidden="true" />
        <input
          placeholder="Add item — search or scan barcode"
          aria-label="Add item"
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={async (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const v = q.trim();
            if (/^\d{6,}$/.test(v)) {
              const res = await apiGet<Paged<MedHit>>("/admin/medicines", { search: v });
              const hit = res.data.find((m) => m.barcode === v) ?? (res.data.length === 1 ? res.data[0] : undefined);
              if (hit) return pick(hit.id);
            }
            if (hits[0]) pick(hits[0].id);
          }}
        />
        {isFetching && <span className="spin" aria-hidden="true" />}
      </div>
      {open && hits.length > 0 && (
        <ul className="search-results" role="listbox">
          {hits.map((m) => (
            <li key={m.id} role="option" aria-selected="false" className="search-result" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m.id)}>
              {fullName(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- History ---------------- */
function History({ onOpen }: { onOpen: (id: number) => void }) {
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [supplier, setSupplier] = useState("");
  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const list = useQuery({
    queryKey: ["admin", "purchases", "history", supplier, page],
    queryFn: () => apiGet<Paged<PurchaseRow>>("/admin/purchases", { supplier_id: supplier || undefined, page }),
    placeholderData: (prev) => prev,
  });
  const info = pageInfo(list.data);

  return (
    <section className="table-card">
      <div className="table-card-filters">
        <select
          className="select w-auto"
          aria-label="Supplier"
          value={supplier}
          onChange={(e) => {
            setSupplier(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All suppliers</option>
          {refs.data?.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Purchase</th>
              <th scope="col">Supplier</th>
              <th scope="col">Date</th>
              <th scope="col">Items</th>
              <th scope="col" className="text-right">
                Total
              </th>
              <th scope="col" className="text-right">
                Paid
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={6}>
                  <Spinner />
                </td>
              </tr>
            )}
            {list.data?.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <button type="button" className="link-button font-medium" onClick={() => onOpen(p.id)}>
                    {p.code}
                  </button>
                  {p.invoice_no && <span className="block text-xs text-muted">Inv. {p.invoice_no}</span>}
                </td>
                <td>{p.supplier?.name}</td>
                <td className="text-ink-2">{date(p.purchased_at, locale)}</td>
                <td className="text-ink-2">{p.items_count}</td>
                <td className="text-right font-medium tabular-nums">{taka(Number(p.total), locale)}</td>
                <td className="text-right tabular-nums">{taka(Number(p.paid), locale)}</td>
              </tr>
            ))}
            {list.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted">
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-card-foot">
        <span>{info.total ? `Showing ${info.from}–${info.to} of ${info.total}` : ""}</span>
        <PageButtons page={info.page} last={info.last} onChange={setPage} />
      </div>
    </section>
  );
}

type PurchaseFull = PurchaseRow & {
  subtotal: string;
  discount: string;
  note: string | null;
  items: { id: number; batch_no: string; expiry_date: string; quantity: number; free_quantity: number; unit_cost: string; mrp: string; line_total: string; medicine: { id: number; name: string; strength: string | null; dosage_form: string | null } | null }[];
};

function PurchaseDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const locale = useLocale();
  const { feature } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "purchase", id], queryFn: () => apiGet<{ data: PurchaseFull }>(`/admin/purchases/${id}`), enabled: !!id });
  const p = data?.data;

  return (
    <Modal open={!!id} onClose={onClose} title={p ? `${p.code} · ${p.supplier?.name ?? ""}` : "Purchase"} description={p ? `${date(p.purchased_at, locale)}${p.invoice_no ? ` · Invoice ${p.invoice_no}` : ""}` : undefined} size="lg">
      {isLoading || !p ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="table-wrap table-wrap-flat">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Medicine</th>
                  <th scope="col">Batch · expiry</th>
                  <th scope="col" className="text-right">
                    Units
                  </th>
                  <th scope="col" className="text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.medicine ? fullName(i.medicine) : "—"}</td>
                    <td className="text-ink-2">
                      {i.batch_no} · {date(i.expiry_date, locale)}
                    </td>
                    <td className="text-right tabular-nums">{i.quantity + i.free_quantity}</td>
                    <td className="text-right tabular-nums">{taka(Number(i.line_total), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="order-sums ml-auto w-64">
            <dt>Items total</dt>
            <dd>{taka(Number(p.subtotal), locale)}</dd>
            <dt>Discount</dt>
            <dd>− {taka(Number(p.discount), locale)}</dd>
            <dt className="font-bold text-ink">Total</dt>
            <dd className="font-bold">{taka(Number(p.total), locale)}</dd>
            <dt>Paid</dt>
            <dd>{taka(Number(p.paid), locale)}</dd>
          </dl>
          <div className="modal-footer">
            {feature("barcode_labels") && (
              <Link href={`/admin/labels?purchase=${p.id}`} className="btn-outline">
                <Tag size={18} aria-hidden="true" />
                Print labels
              </Link>
            )}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
