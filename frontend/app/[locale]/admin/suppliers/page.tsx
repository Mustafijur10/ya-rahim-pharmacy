"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { KpiTile } from "@/components/admin/Blocks";
import { RequireModule } from "@/components/auth/Guards";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, ErrorState, PageLoader, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import type { References } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { date, number, phone, taka, todayIso } from "@/lib/format";

type Supplier = {
  id: number;
  name: string;
  company: { id: number; name: string } | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  visit_frequency: string | null;
  next_visit_on: string | null;
  balance: number;
  purchases_this_year: number;
  is_active: boolean;
};
type Summary = {
  active_this_year: number;
  suppliers: number;
  total_due: number;
  due_suppliers: number;
  paid_this_month: number;
  payments_this_month: number;
  next_visit: { supplier: string; rep: string | null; on: string } | null;
};
type LedgerRow = { date: string; kind: "purchase" | "payment"; details: string; purchase: number; paid: number; balance: number };

/** Seed data placeholders like “[Supplier phone]” are not shown. */
const clean = (v: string | null | undefined) => (v && !/^[.*]$/.test(v.trim()) ? v : null);

const VISIT: Record<string, string> = { weekly: "Weekly", fortnightly: "Every 2 weeks", monthly: "Monthly", on_call: "On call" };

function whenLabel(iso: string, locale: string) {
  const days = Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : date(iso, locale);
}

/** Suppliers (design: "Stock / Suppliers"). */
export default function SuppliersPage() {
  return (
    <RequireModule module="purchases">
      <Suppliers />
    </RequireModule>
  );
}

function Suppliers() {
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["admin", "suppliers", search],
    queryFn: () => apiGet<{ data: Supplier[]; summary: Summary }>("/admin/suppliers", { search: search || undefined }),
    placeholderData: (prev) => prev,
  });

  if (list.isLoading) return <PageLoader />;
  if (list.isError || !list.data) return <ErrorState message="Couldn’t load suppliers." onRetry={() => list.refetch()} />;
  const { data: suppliers, summary: s } = list.data;
  const current = suppliers.find((x) => x.id === selected) ?? suppliers.find((x) => x.balance > 0) ?? suppliers[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Suppliers"
        subtitle="Depots and distributors you buy from — dues, rep visits and payments"
        actions={
          <Button onClick={() => setEditing("new")}>Add supplier</Button>
        }
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiTile label="Suppliers" value={number(s.suppliers, locale)} sub={`${s.active_this_year} active this year`} />
        <KpiTile label="Total due" value={taka(s.total_due, locale)} sub={`To ${s.due_suppliers} supplier${s.due_suppliers === 1 ? "" : "s"}`} tone={s.total_due > 0 ? "alert" : "neutral"} />
        <KpiTile label="Paid this month" value={taka(s.paid_this_month, locale)} sub={`${s.payments_this_month} payment${s.payments_this_month === 1 ? "" : "s"}`} />
        <KpiTile label="Next rep visit" value={s.next_visit ? whenLabel(s.next_visit.on, locale) : "—"} sub={s.next_visit ? `${s.next_visit.supplier}${s.next_visit.rep ? ` — ${s.next_visit.rep}` : ""}` : "No visits planned"} />
      </div>

      <section className="table-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-line px-4 py-3.5">
          <h2 className="m-0 text-base font-bold">All suppliers</h2>
          <input className="input w-[min(320px,100%)]" placeholder="Search supplier, rep or phone" aria-label="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {suppliers.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No suppliers yet" action={<Button onClick={() => setEditing("new")}>Add supplier</Button>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[980px]">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Depot / address</th>
                  <th scope="col">Representative</th>
                  <th scope="col" className="text-right">
                    Purchases this year
                  </th>
                  <th scope="col" className="text-right">
                    Due to pay
                  </th>
                  <th scope="col">Visit</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((x) => (
                  <tr key={x.id} className={x.id === current?.id ? "row-selected" : undefined}>
                    <td className="font-medium">
                      {x.name}
                      {!x.is_active && <span className="badge-neutral ml-2">Inactive</span>}
                    </td>
                    <td className="text-ink-2">{clean(x.address) ?? "—"}</td>
                    <td className="text-ink-2">{[clean(x.contact_person), clean(x.phone) && phone(x.phone)].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-right tabular-nums">{taka(x.purchases_this_year, locale)}</td>
                    <td className={x.balance > 0 ? "text-right font-bold text-accent-dark tabular-nums dark:text-accent-pale" : "text-right tabular-nums"}>{taka(x.balance, locale)}</td>
                    <td className="text-ink-2">
                      {x.visit_frequency ? VISIT[x.visit_frequency] : "—"}
                      {x.next_visit_on && <span className="block text-xs text-muted">Next: {whenLabel(x.next_visit_on, locale)}</span>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1 text-[13px] font-medium">
                        <button type="button" className="link-button" onClick={() => setSelected(x.id)}>
                          Ledger
                        </button>
                        ·
                        <button type="button" className="link-button" disabled={x.balance <= 0} onClick={() => setPaying(x)}>
                          Pay
                        </button>
                        ·
                        <button type="button" className="link-button" onClick={() => setEditing(x)}>
                          Edit
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {current && <Ledger supplier={current} onPay={() => setPaying(current)} />}

      {editing && <SupplierDialog supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {paying && <PayDialog supplier={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function Ledger({ supplier, onPay }: { supplier: Supplier; onPay: () => void }) {
  const locale = useLocale();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "suppliers", "ledger", supplier.id], queryFn: () => apiGet<{ data: LedgerRow[] }>(`/admin/suppliers/${supplier.id}/ledger`) });

  return (
    <section className="table-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-line px-4 py-3.5">
        <h2 className="m-0 text-base font-bold">Supplier ledger — {supplier.name}</h2>
        <Button variant="outline" disabled={supplier.balance <= 0} onClick={onPay}>
          Record payment
        </Button>
      </div>
      {isLoading ? (
        <div className="p-6">
          <Spinner />
        </div>
      ) : !data?.data.length ? (
        <p className="m-0 p-6 text-sm text-muted">No purchases or payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Details</th>
                <th scope="col" className="text-right">
                  Purchase
                </th>
                <th scope="col" className="text-right">
                  Paid
                </th>
                <th scope="col" className="text-right">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-ink-2">{date(r.date, locale)}</td>
                  <td>{r.details}</td>
                  <td className="text-right tabular-nums">{r.purchase ? taka(r.purchase, locale) : "—"}</td>
                  <td className="text-right tabular-nums">{r.paid ? taka(r.paid, locale) : "—"}</td>
                  <td className="text-right font-medium tabular-nums">{taka(r.balance, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const refs = useQuery({ queryKey: ["admin", "references"], queryFn: () => apiGet<References>("/admin/medicines/references"), staleTime: 300_000 });
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    company_id: supplier?.company ? String(supplier.company.id) : "",
    contact_person: supplier?.contact_person ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    visit_frequency: supplier?.visit_frequency ?? "",
    next_visit_on: supplier?.next_visit_on ?? "",
    is_active: supplier?.is_active ?? true,
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, company_id: f.company_id ? Number(f.company_id) : null, visit_frequency: f.visit_frequency || null, next_visit_on: f.next_visit_on || null, email: f.email || null };
      await apiSend(supplier ? "put" : "post", supplier ? `/admin/suppliers/${supplier.id}` : "/admin/suppliers", body);
      queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "references"] });
      toast.success(supplier ? "Supplier saved" : "Supplier added");
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={supplier ? `Edit ${supplier.name}` : "Add supplier"} size="lg">
      <div className="form-grid">
        <TextField label="Supplier name" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} error={error?.field("name")} />
        <SelectField label="Company (optional)" value={f.company_id} onChange={(e) => set("company_id", e.target.value)}>
          <option value="">— None —</option>
          {refs.data?.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Depot / address" value={f.address} onChange={(e) => set("address", e.target.value)} />
        <TextField label="Representative" value={f.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
        <TextField label="Phone" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        <TextField label="Email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} error={error?.field("email")} />
        <SelectField label="Rep visits" value={f.visit_frequency} onChange={(e) => set("visit_frequency", e.target.value)}>
          <option value="">—</option>
          {Object.entries(VISIT).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </SelectField>
        <TextField label="Next visit" type="date" value={f.next_visit_on} onChange={(e) => set("next_visit_on", e.target.value)} />
      </div>
      <Checkbox label="Active — show in purchase entry" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} />
      {error && !Object.keys(error.fieldErrors).length && <p className="field-error m-0">{error.message}</p>}
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!f.name.trim()} onClick={save}>
          Save supplier
        </Button>
      </div>
    </Modal>
  );
}

function PayDialog({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(supplier.balance));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      await apiSend("post", `/admin/suppliers/${supplier.id}/payments`, { amount: Number(amount), method, reference: reference.trim() || null, paid_on: paidOn });
      queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success(`Paid ${taka(Number(amount), locale)} to ${supplier.name}`);
      onClose();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Pay ${supplier.name}`} description={`We owe ${taka(supplier.balance, locale)}.`} size="sm">
      <TextField label="Amount (৳)" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer</option>
          <option value="bkash">bKash</option>
          <option value="cheque">Cheque</option>
        </SelectField>
        <TextField label="Date" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <TextField label="Reference (optional)" placeholder="Cheque / transaction no." value={reference} onChange={(e) => setReference(e.target.value)} />
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!(Number(amount) > 0) || Number(amount) > supplier.balance} onClick={pay}>
          Record payment
        </Button>
      </div>
    </Modal>
  );
}
