"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { ExpiryTag } from "@/components/admin/stock/StockBits";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { SelectField, TextareaField, TextField } from "@/components/ui/Field";
import { Link, useRouter } from "@/i18n/navigation";
import type { BatchRow, References } from "@/lib/admin-types";
import { api, ApiError, apiGet, apiSend, toApiError } from "@/lib/api";
import { taka } from "@/lib/format";

export type MedicineRecord = {
  id: number;
  name: string;
  strength: string | null;
  dosage_form: string | null;
  generic_id: number | null;
  company_id: number | null;
  category_id: number | null;
  barcode: string | null;
  default_rack: string | null;
  unit_name: string;
  rx_required: boolean;
  is_antibiotic: boolean;
  storage: "room" | "fridge" | "cool_dry";
  discount_percent: string | number;
  vat_percent: string | number;
  default_cost: number | null;
  default_mrp: number | null;
  reorder_level: number;
  description: string | null;
  indications: string | null;
  side_effects: string | null;
  images: string[] | null;
  is_active: boolean;
  sell_online: boolean;
  allow_loose_sale: boolean;
  is_featured: boolean;
  pack_sizes: { id: number; name: string; short_name: string; units: number; is_default: boolean; extra_discount_percent: string | number }[];
};

type Pack = { id?: number; short_name: string; units: string; is_default: boolean };

const FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Injection", "Cream", "Ointment", "Drops", "Inhaler", "Sachet", "Powder", "Device"];
const UNITS: Record<string, string> = { Tablet: "tablet", Capsule: "capsule", Syrup: "bottle", Suspension: "bottle", Injection: "vial", Cream: "tube", Ointment: "tube", Drops: "bottle", Inhaler: "inhaler", Sachet: "sachet", Powder: "pack", Device: "piece" };
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const fixed = (n: number | null | undefined, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "" : String(+n.toFixed(d)));

/** Add / edit medicine (design: "Stock / Medicines / Edit medicine"). Prices are entered per default pack. */
export default function MedicineForm({ initial, batches = [], duplicate = false }: { initial?: MedicineRecord; batches?: BatchRow[]; duplicate?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const editing = !!initial && !duplicate;
  const m = initial;

  const defaultPack = m?.pack_sizes.find((p) => p.is_default) ?? m?.pack_sizes[0];
  const per0 = defaultPack?.units ?? 10;

  const [f, setF] = useState({
    name: m?.name ?? "",
    strength: m?.strength ?? "",
    dosage_form: m?.dosage_form ?? "Tablet",
    unit_name: m?.unit_name ?? "tablet",
    generic_id: m?.generic_id ? String(m.generic_id) : "",
    company_id: m?.company_id ? String(m.company_id) : "",
    category_id: m?.category_id ? String(m.category_id) : "",
    barcode: duplicate ? "" : (m?.barcode ?? ""),
    default_rack: m?.default_rack ?? "",
    reorder_packs: m ? fixed(m.reorder_level / per0, 1) : "2",
    storage: m?.storage ?? "room",
    vat_percent: m ? String(Number(m.vat_percent)) : "0",
    cost_pack: fixed(m?.default_cost != null ? m.default_cost * per0 : null),
    mrp_pack: fixed(m?.default_mrp != null ? m.default_mrp * per0 : null),
    discount: m ? String(Number(m.discount_percent)) : "0",
    description: m?.description ?? "",
    indications: m?.indications ?? "",
    side_effects: m?.side_effects ?? "",
    rx_required: m?.rx_required ?? false,
    is_antibiotic: m?.is_antibiotic ?? false,
    sell_online: m?.sell_online ?? true,
    allow_loose_sale: m?.allow_loose_sale ?? true,
    is_active: m?.is_active ?? true,
  });
  const [packs, setPacks] = useState<Pack[]>(
    m?.pack_sizes.length ? m.pack_sizes.map((p) => ({ id: duplicate ? undefined : p.id, short_name: p.short_name, units: String(p.units), is_default: p.is_default })) : [{ short_name: "strip", units: "10", is_default: true }],
  );
  const [images, setImages] = useState<string[]>(duplicate ? [] : (m?.images ?? []));
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [newGeneric, setNewGeneric] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const per = Number(packs.find((p) => p.is_default)?.units ?? packs[0]?.units) || 1;
  const short = packs.find((p) => p.is_default)?.short_name || packs[0]?.short_name || "pack";
  const mrp = Number(f.mrp_pack) || 0;
  const sell = mrp ? +(mrp * (1 - (Number(f.discount) || 0) / 100)).toFixed(2) : 0;
  const err = (k: string) => error?.field(k);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let genericId = f.generic_id ? Number(f.generic_id) : null;
      if (newGeneric?.trim()) {
        const g = await apiSend<{ data: { id: number } }>("post", "/admin/generics", { name: newGeneric.trim() });
        genericId = g.data.id;
      }
      const body = {
        name: f.name.trim(),
        strength: f.strength.trim() || null,
        dosage_form: f.dosage_form,
        unit_name: f.unit_name.trim() || "unit",
        generic_id: genericId,
        company_id: f.company_id ? Number(f.company_id) : null,
        category_id: f.category_id ? Number(f.category_id) : null,
        barcode: f.barcode.trim() || null,
        default_rack: f.default_rack.trim() || null,
        reorder_level: Math.round((Number(f.reorder_packs) || 0) * per),
        storage: f.storage,
        vat_percent: Number(f.vat_percent) || 0,
        default_cost: num(f.cost_pack) !== null ? +(Number(f.cost_pack) / per).toFixed(4) : null,
        default_mrp: num(f.mrp_pack) !== null ? +(Number(f.mrp_pack) / per).toFixed(4) : null,
        discount_percent: Number(f.discount) || 0,
        description: f.description.trim() || null,
        indications: f.indications.trim() || null,
        side_effects: f.side_effects.trim() || null,
        rx_required: f.rx_required,
        is_antibiotic: f.is_antibiotic,
        sell_online: f.sell_online,
        allow_loose_sale: f.allow_loose_sale,
        is_active: f.is_active,
        pack_sizes: packs.map((p) => ({ id: p.id, short_name: p.short_name.trim() || "pack", units: Number(p.units) || 1, is_default: p.is_default, name: `1 ${p.short_name.trim() || "pack"}${Number(p.units) > 1 ? ` (${p.units} ${f.unit_name}s)` : ""}` })),
      };
      const res = editing ? await apiSend<{ data: { id: number } }>("put", `/admin/medicines/${m!.id}`, body) : await apiSend<{ data: { id: number } }>("post", "/admin/medicines", body);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(editing ? "Medicine saved" : "Medicine added", editing ? undefined : "Add photos and a purchase entry to start selling.");
      if (!editing) router.replace(`/admin/medicines/${res.data.id}`);
    } catch (e) {
      const ae = e as ApiError;
      setError(ae);
      toast.error(ae.message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (!m || !editing) return;
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await api.post<{ data: { images: string[] } }>(`/admin/medicines/${m.id}/images`, fd);
      setImages(res.data.data.images);
    } catch (e) {
      toast.error(toApiError(e).message);
    }
  }

  async function removeImage(url: string) {
    try {
      const res = await apiSend<{ data: { images: string[] } }>("delete", `/admin/medicines/${m!.id}/images`, { url });
      setImages(res.data.images);
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  }

  const fullName = [f.name, f.strength].filter(Boolean).join(" ") || "New medicine";
  const toggles: { key: "rx_required" | "is_antibiotic" | "sell_online" | "allow_loose_sale" | "is_active"; title: string; help: string }[] = [
    { key: "rx_required", title: "Prescription required (Rx)", help: "Pharmacist must approve before sale" },
    { key: "is_antibiotic", title: "Antibiotic", help: "Extra warning at POS" },
    { key: "sell_online", title: "Sell online", help: "Show on the website" },
    { key: "allow_loose_sale", title: "Allow loose sale", help: "Sell single tablets" },
    { key: "is_active", title: "On sale", help: "Turn off to stop selling everywhere" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={editing ? "Edit medicine" : duplicate ? "Duplicate medicine" : "Add medicine"}
        subtitle={`Stock / Medicines / ${fullName}`}
        actions={
          <>
            <Link href="/admin/medicines" className="btn-ghost">
              Cancel
            </Link>
            {editing && (
              <Link href={`/admin/medicines/new?from=${m!.id}`} className="btn-outline hidden md:inline-flex">
                Duplicate
              </Link>
            )}
            <Button loading={saving} disabled={!f.name.trim()} onClick={save}>
              Save medicine
            </Button>
          </>
        }
      />

      <div className="form-layout">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="panel">
            <h2 className="panel-title">Basic information</h2>
            <div className="form-grid">
              <TextField label="Brand name" value={f.name} onChange={(e) => set("name", e.target.value)} error={err("name")} />
              {newGeneric === null ? (
                <SelectField
                  label="Generic name"
                  hint="Used for “same generic, other brands”"
                  value={f.generic_id}
                  onChange={(e) => (e.target.value === "__new" ? setNewGeneric("") : set("generic_id", e.target.value))}
                >
                  <option value="">— None —</option>
                  {refs.data?.generics.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="__new">+ Add new generic…</option>
                </SelectField>
              ) : (
                <TextField label="New generic name" autoFocus value={newGeneric} onChange={(e) => setNewGeneric(e.target.value)} hint={<button type="button" className="link-button" onClick={() => setNewGeneric(null)}>Pick from list instead</button>} />
              )}
              <TextField label="Strength" placeholder="e.g. 20 mg" value={f.strength} onChange={(e) => set("strength", e.target.value)} />
              <SelectField
                label="Dosage form"
                value={f.dosage_form}
                onChange={(e) => {
                  set("dosage_form", e.target.value);
                  if (!m) set("unit_name", UNITS[e.target.value] ?? "unit");
                }}
              >
                {FORMS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </SelectField>
              <SelectField label="Company" value={f.company_id} onChange={(e) => set("company_id", e.target.value)}>
                <option value="">— Choose —</option>
                {refs.data?.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Category" value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">— Choose —</option>
                {refs.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? `${refs.data?.categories.find((p) => p.id === c.parent_id)?.name ?? ""} › ${c.name}` : c.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Pack &amp; price</h2>
            <div className="flex flex-col gap-2">
              <span className="field-label">Pack sizes</span>
              {packs.map((p, i) => (
                <div key={i} className="pack-row">
                  <input className="input" aria-label="Pack name" placeholder="strip" value={p.short_name} onChange={(e) => setPacks((ps) => ps.map((x, j) => (j === i ? { ...x, short_name: e.target.value } : x)))} />
                  <span className="text-sm text-muted">of</span>
                  <input className="input w-20" aria-label="Units per pack" inputMode="numeric" value={p.units} onChange={(e) => setPacks((ps) => ps.map((x, j) => (j === i ? { ...x, units: e.target.value.replace(/\D/g, "") } : x)))} />
                  <span className="text-sm text-muted">{f.unit_name}s</span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="default-pack" className="checkbox" checked={p.is_default} onChange={() => setPacks((ps) => ps.map((x, j) => ({ ...x, is_default: j === i })))} />
                    Selling unit
                  </label>
                  {packs.length > 1 && (
                    <button type="button" className="btn-icon btn-ghost" aria-label="Remove pack" onClick={() => setPacks((ps) => { const next = ps.filter((_, j) => j !== i); if (!next.some((x) => x.is_default)) next[0].is_default = true; return [...next]; })}>
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {packs.length < 5 && (
                <button type="button" className="link-button inline-flex items-center gap-1 self-start text-sm" onClick={() => setPacks((ps) => [...ps, { short_name: "box", units: String(per * 10), is_default: false }])}>
                  <Plus size={14} aria-hidden="true" /> Add pack size
                </button>
              )}
            </div>
            <div className="form-grid">
              <TextField label={`Unit name`} hint="Smallest piece sold, e.g. tablet, capsule, ml" value={f.unit_name} onChange={(e) => set("unit_name", e.target.value)} />
              <TextField label={`Purchase cost / ${short}`} inputMode="decimal" value={f.cost_pack} onChange={(e) => set("cost_pack", e.target.value.replace(/[^\d.]/g, ""))} hint="Pre-fills the next purchase entry" />
              <TextField label={`MRP / ${short}`} inputMode="decimal" value={f.mrp_pack} onChange={(e) => set("mrp_pack", e.target.value.replace(/[^\d.]/g, ""))} error={err("default_mrp")} />
              <TextField
                label={`Selling price / ${short}`}
                inputMode="decimal"
                value={mrp ? String(sell) : ""}
                disabled={!mrp}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/[^\d.]/g, ""));
                  if (mrp) set("discount", String(Math.max(0, Math.min(100, +((1 - v / mrp) * 100).toFixed(2)))));
                }}
                hint={mrp ? `Shown online · ${Number(f.discount) || 0}% below MRP` : "Enter MRP first"}
              />
              <TextField label="Online discount %" inputMode="decimal" value={f.discount} onChange={(e) => set("discount", e.target.value.replace(/[^\d.]/g, ""))} error={err("discount_percent")} />
              <SelectField label="VAT" value={f.vat_percent} onChange={(e) => set("vat_percent", e.target.value)}>
                <option value="0">Included in MRP</option>
                <option value="5">5%</option>
                <option value="7.5">7.5%</option>
                <option value="15">15%</option>
              </SelectField>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Stock &amp; storage</h2>
            <div className="form-grid">
              <TextField label="Barcode" value={f.barcode} onChange={(e) => set("barcode", e.target.value)} hint="Scan the box, or leave empty — labels can create one" error={err("barcode")} />
              <TextField label="Rack location" placeholder="e.g. A-3" value={f.default_rack} onChange={(e) => set("default_rack", e.target.value)} />
              <TextField label={`Reorder level (${short}s)`} inputMode="decimal" value={f.reorder_packs} onChange={(e) => set("reorder_packs", e.target.value.replace(/[^\d.]/g, ""))} hint="Alert when stock goes below" />
              <SelectField label="Storage" value={f.storage} onChange={(e) => set("storage", e.target.value as typeof f.storage)}>
                <option value="room">Room temperature</option>
                <option value="fridge">Fridge 2–8 °C</option>
                <option value="cool_dry">Cool &amp; dry</option>
              </SelectField>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Medicine information (website)</h2>
            <TextareaField label="Short description" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
            <div className="form-grid">
              <TextareaField label="Indications" rows={3} value={f.indications} onChange={(e) => set("indications", e.target.value)} />
              <TextareaField label="Side effects" rows={3} value={f.side_effects} onChange={(e) => set("side_effects", e.target.value)} />
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Photos</h2>
            {!editing ? (
              <p className="m-0 text-sm text-muted">Save the medicine first, then add photos.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map((src) => (
                  <div key={src} className="photo-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file served by Laravel */}
                    <img src={src} alt="" className="h-full w-full object-contain" />
                    <button type="button" className="photo-remove" aria-label="Remove photo" onClick={() => removeImage(src)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {images.length < 6 && (
                  <button type="button" className="photo-tile photo-add" onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={22} aria-hidden="true" />
                    Add
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Upload photo"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="panel">
            <h2 className="panel-title">Rules</h2>
            <div className="flex flex-col">
              {toggles.map((t) => (
                <label key={t.key} className="switch-row">
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted">{t.help}</span>
                  </span>
                  <input type="checkbox" className="switch" checked={f[t.key]} onChange={(e) => set(t.key, e.target.checked)} />
                </label>
              ))}
            </div>
          </section>
          {editing && (
            <section className="panel">
              <h2 className="panel-title">Current stock</h2>
              {batches.filter((b) => b.quantity > 0).length === 0 ? (
                <p className="m-0 text-sm text-muted">No stock yet. Add it with a purchase entry.</p>
              ) : (
                <ul className="list-rows">
                  {batches
                    .filter((b) => b.quantity > 0)
                    .map((b) => (
                      <li key={b.id}>
                        <span className="flex min-w-0 flex-col text-sm">
                          <span className="font-medium">Batch {b.batch_no}</span>
                          <span className="text-xs text-muted">
                            <ExpiryTag b={b} /> · MRP {taka(b.mrp_per_pack, locale)}
                            {b.rack ? ` · ${b.rack}` : ""}
                          </span>
                        </span>
                        <b className="text-sm whitespace-nowrap">
                          {b.quantity_packs} {b.pack_name ?? "units"}
                        </b>
                      </li>
                    ))}
                </ul>
              )}
              <Link href="/admin/purchases" className="text-sm font-medium">
                + Purchase entry
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
