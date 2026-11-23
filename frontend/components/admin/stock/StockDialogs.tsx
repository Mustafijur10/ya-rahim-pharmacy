"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { MOVEMENT_LABEL, type BatchRow, type Paged } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { date, dateTime } from "@/lib/format";

const REASONS = [
  ["damaged", "Damaged / broken"],
  ["expired", "Expired — write off"],
  ["count_correction", "Count correction"],
  ["lost", "Lost / missing"],
  ["supplier_return", "Returned to supplier"],
  ["other", "Other"],
] as const;

const batchLabel = (b: BatchRow) => `${b.medicine?.name ?? "Medicine"} · ${b.batch_no} · ${b.quantity_packs} ${b.pack_name ?? "units"}`;

/** Stock correction. Full rights apply at once; store keepers send it for approval. */
export function AdjustDialog({ open, batch, onClose }: { open: boolean; batch: BatchRow | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<BatchRow | null>(batch);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [dir, setDir] = useState<"out" | "in">("out");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<"pack" | "unit">("pack");
  const [reason, setReason] = useState<string>("damaged");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ["admin", "inventory", "pick", term],
    queryFn: () => apiGet<Paged<BatchRow>>("/admin/inventory", { search: term, per_page: 8 }),
    enabled: open && !picked && term.length >= 2,
  });

  const b = picked;
  const perPack = b && b.quantity_packs > 0 ? Math.round(b.quantity / b.quantity_packs) : 1;
  const units = (Number(qty) || 0) * (unit === "pack" ? perPack : 1);

  async function save() {
    if (!b || units < 1) return;
    setBusy(true);
    try {
      const res = await apiSend<{ applied: boolean }>("post", "/admin/inventory/adjustments", { batch_id: b.id, quantity: dir === "out" ? -units : units, reason, note: note.trim() || null });
      toast.success(res.applied ? "Stock updated" : "Sent for approval", res.applied ? undefined : "The owner or manager will approve it.");
      queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["badges"] });
      onClose();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Stock adjustment" description="Correct stock for damage, loss, expiry or a recount. Every change is logged.">
      {!b ? (
        <div className="flex flex-col gap-3">
          <TextField label="Find batch" placeholder="Brand, generic or batch no." autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
          {search.isFetching && <Spinner />}
          <ul className="list-rows">
            {search.data?.data.map((r) => (
              <li key={r.id}>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{r.medicine?.name}</span>
                  <span className="text-xs text-muted">
                    Batch {r.batch_no} · exp {date(r.expiry_date)} · {r.quantity_packs} {r.pack_name ?? "units"}
                    {r.rack ? ` · Rack ${r.rack}` : ""}
                  </span>
                </span>
                <Button variant="outline" onClick={() => setPicked(r)}>
                  Choose
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="tile flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{batchLabel(b)}</span>
            {!batch && (
              <button type="button" className="link-button" onClick={() => setPicked(null)}>
                Change
              </button>
            )}
          </div>
          <div className="segmented" role="radiogroup" aria-label="Direction">
            {(["out", "in"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={dir === d} className={dir === d ? "segmented-option segmented-option-active" : "segmented-option"} onClick={() => setDir(d)}>
                {d === "out" ? "Remove stock (−)" : "Add stock (+)"}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} hint={units ? `= ${units} unit${units === 1 ? "" : "s"}` : undefined} />
            <SelectField label="Counted in" value={unit} onChange={(e) => setUnit(e.target.value as "pack" | "unit")}>
              <option value="pack">{b.pack_name ?? "pack"}s ({perPack} units each)</option>
              <option value="unit">Single units</option>
            </SelectField>
          </div>
          <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextField label="Note (optional)" placeholder="e.g. Damaged in rack B-4" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!b || units < 1} onClick={save}>
          Save adjustment
        </Button>
      </div>
    </Modal>
  );
}

type Movement = { id: number; type: string; quantity: number; balance_after: number; note: string | null; created_at: string; user?: { name: string } | null; batch?: { batch_no: string } | null };

/** Every stock change of one batch: purchases, sales, returns, adjustments. */
export function HistoryDialog({ batch, onClose }: { batch: BatchRow | null; onClose: () => void }) {
  const locale = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "inventory", "movements", batch?.id],
    queryFn: () => apiGet<Paged<Movement>>("/admin/inventory/movements", { batch_id: batch!.id }),
    enabled: !!batch,
  });

  return (
    <Modal open={!!batch} onClose={onClose} title={batch ? `${batch.medicine?.name} · ${batch.batch_no}` : "History"} description="Stock movements, newest first. Quantities are in single units." size="lg">
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No movements yet" />
      ) : (
        <div className="table-wrap table-wrap-flat">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col" className="text-right">
                  Change
                </th>
                <th scope="col" className="text-right">
                  Left
                </th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-ink-2">{dateTime(m.created_at, locale)}</td>
                  <td>
                    {MOVEMENT_LABEL[m.type] ?? m.type}
                    {m.note ? <span className="block text-xs text-muted">{m.note}</span> : null}
                  </td>
                  <td className={m.quantity < 0 ? "text-right font-medium text-rx tabular-nums" : "text-right font-medium tabular-nums"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="text-right tabular-nums">{m.balance_after}</td>
                  <td className="text-ink-2">{m.user?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
