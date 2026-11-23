"use client";

import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, Notice, PageLoader, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { Link } from "@/i18n/navigation";
import type { BatchRow, Paged } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { date } from "@/lib/format";

type Item = { key: string; batch_id: number; medicine_id: number; name: string; generic: string | null; batch_no: string; expiry: string; mrp: number; rack: string | null; barcode: string | null; count: number };
type PurchaseItems = { data: { id: number; items: { medicine_id: number; batch_no: string; quantity: number; free_quantity: number }[] } };
type MedShow = { data: { id: number; name: string; strength: string | null; generic: { name: string } | null; barcode: string | null }; batches: BatchRow[] };

/** Labels shown on screen; the rest still print. */
const PREVIEW = 48;

const fromBatch = (b: BatchRow, count: number, generic?: string | null): Item => ({
  key: `${b.id}`,
  batch_id: b.id,
  medicine_id: b.medicine!.id,
  name: b.medicine?.short_name ?? b.medicine?.name ?? "",
  generic: generic ?? b.medicine?.generic ?? null,
  batch_no: b.batch_no,
  expiry: b.expiry_date,
  mrp: b.mrp_per_pack,
  rack: b.rack,
  barcode: b.medicine?.barcode ?? null,
  count,
});

/** Barcode labels (design: "Stock / Labels"): price & barcode stickers for shelves and boxes. */
export default function LabelsPage() {
  return (
    <RequireModule module="inventory">
      <Suspense fallback={<PageLoader />}>
        <Labels />
      </Suspense>
    </RequireModule>
  );
}

function Labels() {
  const locale = useLocale();
  const toast = useToast();
  const params = useSearchParams();
  const { feature } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [opts, setOpts] = useState({ mrp: true, rack: true, expiry: false, size: "38x25" });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const loadedPurchase = useRef<string | null>(null);
  const total = items.reduce((s, i) => s + i.count, 0);

  async function loadPurchase(id?: number) {
    setLoading(true);
    try {
      let purchaseId = id;
      if (!purchaseId) {
        const list = await apiGet<Paged<{ id: number }>>("/admin/purchases");
        purchaseId = list.data[0]?.id;
        if (!purchaseId) return toast.error("No purchases yet.");
      }
      const p = await apiGet<PurchaseItems>(`/admin/purchases/${purchaseId}`);
      const meds = new Map<number, MedShow>();
      for (const mid of new Set(p.data.items.map((i) => i.medicine_id))) meds.set(mid, await apiGet<MedShow>(`/admin/medicines/${mid}`));
      const next: Item[] = [];
      for (const line of p.data.items) {
        const m = meds.get(line.medicine_id);
        const b = m?.batches.find((x) => x.batch_no === line.batch_no);
        if (!b || !m) continue;
        const per = b.quantity_packs > 0 ? b.quantity / b.quantity_packs : 1;
        next.push(fromBatch(b, Math.min(50, Math.max(1, Math.round((line.quantity + line.free_quantity) / per))), m.data.generic?.name));
      }
      setItems(next);
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  // Opened from a purchase ("Print labels"): load its batches once.
  const purchaseParam = params.get("purchase");
  useEffect(() => {
    if (purchaseParam && loadedPurchase.current !== purchaseParam) {
      loadedPurchase.current = purchaseParam;
      void loadPurchase(Number(purchaseParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per purchase id
  }, [purchaseParam]);

  async function print() {
    setPrinting(true);
    try {
      const missing = [...new Set(items.filter((i) => !i.barcode).map((i) => i.medicine_id))];
      if (missing.length) {
        const res = await apiSend<{ data: Record<string, string> }>("post", "/admin/labels/barcodes", { medicine_ids: missing });
        setItems((its) => its.map((i) => (i.barcode ? i : { ...i, barcode: res.data[String(i.medicine_id)] ?? null })));
        toast.success("Barcodes created", "New in-store barcodes were saved so the POS scanner finds them.");
      }
      setTimeout(() => window.print(), 300);
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setPrinting(false);
    }
  }

  const sheet = items.flatMap((i) => Array.from({ length: i.count }, (_, n) => ({ ...i, n })));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Barcode labels"
        subtitle="Print price & barcode stickers for shelves and boxes"
        actions={
          <>
            <Button variant="outline" loading={loading} onClick={() => loadPurchase()}>
              From last purchase
            </Button>
            <Button icon={<Printer size={18} aria-hidden="true" />} loading={printing} disabled={!total} onClick={print}>
              Print {total} label{total === 1 ? "" : "s"}
            </Button>
          </>
        }
      />
      {!feature("barcode_labels") && (
        <Notice tone="warn" title="Barcode labels are switched off">
          Turn them on in <Link href="/admin/modules">Modules &amp; features</Link> to show this page in the menu.
        </Notice>
      )}

      <div className="labels-layout">
        <section className="panel no-print-bg">
          <h2 className="panel-title no-print">Preview — {opts.size === "38x25" ? "38 × 25 mm" : "50 × 30 mm"}</h2>
          {sheet.length === 0 ? (
            <div className="no-print">
              <EmptyState title="No labels yet" description="Add items or load the last purchase." />
            </div>
          ) : (
            <div className="label-sheet">
              {sheet.map((l, idx) => (
                <div key={`${l.key}-${l.n}`} className={`label label-${opts.size}${idx >= PREVIEW ? " label-extra" : ""}`}>
                  <b className="label-name">{l.name}</b>
                  <span className="label-sub">
                    {[l.generic, l.batch_no].filter(Boolean).join(" · ")}
                    {opts.expiry ? ` · Exp ${new Intl.DateTimeFormat("en-GB", { month: "2-digit", year: "2-digit" }).format(new Date(l.expiry))}` : ""}
                  </span>
                  <Barcode value={l.barcode} />
                  <span className="label-foot">
                    <span>{opts.mrp ? `MRP ৳${+l.mrp.toFixed(2)}` : ""}</span>
                    <span>{opts.rack && l.rack ? `Rack ${l.rack}` : ""}</span>
                  </span>
                </div>
              ))}
              {sheet.length > PREVIEW && <p className="label-more no-print">+ {sheet.length - PREVIEW} more labels — all of them print.</p>}
            </div>
          )}
        </section>

        <aside className="no-print flex min-w-0 flex-col gap-5">
          <section className="table-card">
            <div className="flex items-center justify-between gap-3 border-b border-solid border-line px-4 py-3.5">
              <h2 className="m-0 text-base font-bold">Items to print</h2>
              <Button variant="outline" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAdding(true)}>
                Add
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="m-0 p-4 text-sm text-muted">Nothing added yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Medicine</th>
                    <th scope="col">Batch</th>
                    <th scope="col" className="text-right">
                      Labels
                    </th>
                    <th scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.key}>
                      <td className="font-medium">{i.name}</td>
                      <td className="text-ink-2">{i.batch_no}</td>
                      <td className="text-right">
                        <input
                          className="input h-8 w-16 text-right"
                          inputMode="numeric"
                          aria-label={`Labels for ${i.name}`}
                          value={i.count}
                          onChange={(e) => setItems((its) => its.map((x) => (x.key === i.key ? { ...x, count: Math.min(200, Number(e.target.value.replace(/\D/g, "")) || 0) } : x)))}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn-icon btn-ghost" aria-label={`Remove ${i.name}`} onClick={() => setItems((its) => its.filter((x) => x.key !== i.key))}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">Label options</h2>
            <Checkbox label="Show MRP" checked={opts.mrp} onChange={(e) => setOpts((o) => ({ ...o, mrp: e.target.checked }))} />
            <Checkbox label="Show rack location" checked={opts.rack} onChange={(e) => setOpts((o) => ({ ...o, rack: e.target.checked }))} />
            <Checkbox label="Show expiry" checked={opts.expiry} onChange={(e) => setOpts((o) => ({ ...o, expiry: e.target.checked }))} />
            <SelectField label="Label size" value={opts.size} onChange={(e) => setOpts((o) => ({ ...o, size: e.target.value }))}>
              <option value="38x25">38 × 25 mm</option>
              <option value="50x30">50 × 30 mm</option>
            </SelectField>
            <p className="m-0 text-xs text-muted">Medicines without a barcode get an in-store code when you print, so the POS scanner can read the sticker.</p>
          </section>
        </aside>
      </div>

      {adding && (
        <AddBatchDialog
          locale={locale}
          onClose={() => setAdding(false)}
          onAdd={(b) => setItems((its) => (its.some((x) => x.batch_id === b.id) ? its : [...its, fromBatch(b, Math.max(1, Math.min(50, Math.round(b.quantity_packs))))]))}
        />
      )}
    </div>
  );
}

/** Code 128 barcode drawn into an SVG (shows a dashed placeholder until a code exists). */
function Barcode({ value }: { value: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) JsBarcode(ref.current, value, { format: "CODE128", height: 30, width: 1.2, margin: 0, fontSize: 10, textMargin: 1 });
  }, [value]);
  return value ? <svg ref={ref} className="label-barcode" role="img" aria-label={`Barcode ${value}`} /> : <span className="label-barcode-empty">barcode on print</span>;
}

function AddBatchDialog({ locale, onClose, onAdd }: { locale: string; onClose: () => void; onAdd: (b: BatchRow) => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({ queryKey: ["admin", "inventory", "labels-pick", term], queryFn: () => apiGet<Paged<BatchRow>>("/admin/inventory", { search: term, per_page: 10 }), enabled: term.length >= 2 });

  return (
    <Modal open onClose={onClose} title="Add item" description="Search the medicine or batch to label.">
      <TextField label="Search" hideLabel autoFocus placeholder="Brand, generic or batch no." value={q} onChange={(e) => setQ(e.target.value)} />
      {isFetching && <Spinner />}
      <ul className="list-rows">
        {data?.data.map((b) => (
          <li key={b.id}>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{b.medicine?.name}</span>
              <span className="text-xs text-muted">
                Batch {b.batch_no} · exp {date(b.expiry_date, locale)} · {b.quantity_packs} {b.pack_name ?? "units"}
              </span>
            </span>
            <Button variant="outline" onClick={() => onAdd(b)}>
              Add
            </Button>
          </li>
        ))}
      </ul>
      <div className="modal-footer">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
