"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Phone, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import type { AdminPrescription } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime, phone, timeAgo } from "@/lib/format";
import RxViewer from "./RxViewer";

const FILTERS = [
  { key: "pending", label: "Waiting" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
] as const;

/**
 * Prescriptions sent without an order (website “Upload prescription”, counter scans): the pharmacist
 * checks them, calls the customer, and either verifies (ready for an order) or rejects with a reason.
 */
export default function PrescriptionRequests({ toolbar }: { toolbar: ReactNode }) {
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const isPharmacist = can("rx", "full");
  const [status, setStatus] = useState<(typeof FILTERS)[number]["key"]>("pending");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["admin", "prescriptions", status, search],
    queryFn: () => apiGet<{ data: AdminPrescription[] }>("/admin/prescriptions", { standalone: 1, status, search: search || undefined }),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
  const items = list.data?.data ?? [];
  const rx = items.find((r) => r.id === picked) ?? items[0];

  async function review(decision: "verified" | "rejected") {
    if (!rx) return;
    setBusy(decision);
    try {
      await apiSend("post", `/admin/prescriptions/${rx.id}/review`, { decision, note: note.trim() || null });
      toast.success(decision === "verified" ? "Prescription verified" : "Prescription rejected");
      setNote("");
      setPicked(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["badges"] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const name = (r: AdminPrescription) => r.customer?.name ?? r.contact_name ?? "Customer";
  const tel = rx ? (rx.contact_phone ?? rx.customer?.phone) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Prescriptions"
        subtitle="Prescriptions sent without an order — check, call and verify"
        actions={
          <div className="order-search">
            <label htmlFor="rx-q" className="sr-only">
              Search prescriptions
            </label>
            <input id="rx-q" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      {toolbar}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={status === f.key ? "chip chip-active" : "chip"} aria-pressed={status === f.key} onClick={() => { setStatus(f.key); setPicked(null); }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="orders-layout">
        <section className="order-queue" aria-label="Prescription requests">
          <div className="order-queue-head">
            Requests
            {list.isFetching && <Spinner size={16} label="" />}
          </div>
          {list.isError ? (
            <ErrorState message="Couldn’t load prescriptions." onRetry={() => list.refetch()} />
          ) : list.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No prescriptions here" />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {items.map((r) => (
                <li key={r.id}>
                  <button type="button" className={r.id === rx?.id ? "order-row order-row-active" : "order-row"} onClick={() => setPicked(r.id)}>
                    <span className="flex justify-between gap-2">
                      <b className="truncate text-sm font-medium">
                        RX-{r.id} · {name(r)}
                      </b>
                      <span className="shrink-0 text-xs text-muted">{timeAgo(r.created_at)}</span>
                    </span>
                    <span className="text-[13px] text-muted">
                      {r.pages?.length ?? 0} page{r.pages?.length === 1 ? "" : "s"}
                      {r.delivery_type ? ` · wants ${r.delivery_type}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {rx ? (
          <section className="panel order-detail" aria-label={`Prescription ${rx.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-xl font-bold">
                  RX-{rx.id} · {name(rx)}
                </h2>
                <span className="text-[13px] text-muted">Sent {dateTime(rx.created_at, locale)}</span>
              </div>
              <span className={`order-tag ${rx.status === "pending" ? "order-tag-rx" : rx.status === "verified" ? "order-tag-done" : "order-tag-cancelled"}`}>{rx.status === "pending" ? "Waiting for pharmacist" : rx.status === "verified" ? "Verified" : "Rejected"}</span>
            </div>
            <div className="flex flex-wrap gap-5">
              <div className="min-w-0 flex-[1_1_300px]">
                <RxViewer key={rx.id} rx={rx} />
              </div>
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 text-sm">
                <dl className="order-sums">
                  <dt>Name</dt>
                  <dd>{name(rx)}</dd>
                  <dt>Mobile</dt>
                  <dd>{phone(tel)}</dd>
                  {rx.delivery_type && (
                    <>
                      <dt>Wants</dt>
                      <dd className="capitalize">{rx.delivery_type}</dd>
                    </>
                  )}
                </dl>
                {rx.customer_note && <p className="tile m-0">“{rx.customer_note}”</p>}
                {rx.status !== "pending" && (
                  <p className={rx.status === "verified" ? "notice notice-brand m-0" : "notice notice-rx m-0"}>
                    {rx.status === "verified" ? `Verified by ${rx.verified_by?.name ?? "pharmacist"}${rx.pharmacist_note ? ` — ${rx.pharmacist_note}` : ""}` : `Rejected: ${rx.reject_reason}`}
                  </p>
                )}
                {rx.status === "pending" && isPharmacist && (
                  <TextareaField label="Note (required to reject)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. All medicines available — call to confirm delivery" />
                )}
                {rx.status === "pending" && !isPharmacist && <p className="notice notice-warn m-0">A pharmacist needs to check this prescription.</p>}
              </div>
            </div>
            <div className="order-actions">
              {tel && (
                <a href={`tel:${tel}`} className="btn-outline">
                  <Phone size={18} aria-hidden="true" />
                  Call {phone(tel)}
                </a>
              )}
              {can("orders", "full") && rx.status === "verified" && (
                <Link href={`/admin/orders?stage=new`} className="btn-ghost">
                  Go to orders
                </Link>
              )}
              <span className="flex-1" />
              {rx.status === "pending" && isPharmacist && (
                <>
                  <button type="button" className="btn-outline order-reject" disabled={busy !== null || note.trim().length < 3} onClick={() => review("rejected")}>
                    <X size={18} aria-hidden="true" />
                    Reject
                  </button>
                  <Button size="lg" loading={busy === "verified"} icon={<Check size={18} aria-hidden="true" />} onClick={() => review("verified")}>
                    Verify prescription
                  </Button>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="panel items-center justify-center py-16 text-sm text-muted">Nothing to show.</section>
        )}
      </div>
    </div>
  );
}
