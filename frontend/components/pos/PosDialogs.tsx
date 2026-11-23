"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, UserPlus, XCircle } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { EmptyState, Spinner } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import type { Approval } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { phone, timeAgo } from "@/lib/format";
import type { HeldCart, PosCustomer } from "./pos-types";

/* ---------------- Customer (F4) ---------------- */
export function CustomerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: PosCustomer | null) => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["pos", "customers", term],
    queryFn: () => apiGet<{ data: PosCustomer[] }>("/admin/pos/customers", { q: term }),
    enabled: open && term.length >= 2,
  });

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ data: PosCustomer }>("post", "/admin/pos/customers", { name, phone: mobile });
      onPick(res.data);
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Customer" description="Search by name or mobile number, or add a new customer.">
      {!adding ? (
        <>
          <TextField label="Search customer" hideLabel autoFocus placeholder="Name or 01XXXXXXXXX" value={q} onChange={(e) => setQ(e.target.value)} />
          {isFetching && <Spinner label="Searching…" />}
          {data && (
            <ul className="list-rows">
              {data.data.length === 0 && <li className="text-sm text-muted">No customer found.</li>}
              {data.data.map((c) => (
                <li key={c.id}>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted">
                      {phone(c.phone)} · {c.orders_count ?? 0} past purchases
                      {c.notes ? ` · ${c.notes}` : ""}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      onPick(c);
                      onClose();
                    }}
                  >
                    Choose
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-footer justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                onPick(null);
                onClose();
              }}
            >
              Walk-in customer
            </Button>
            <Button variant="outline" icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => { setAdding(true); setMobile(/^\d+$/.test(q) ? q : ""); setName(/^\d+$/.test(q) ? "" : q); }}>
              Add new customer
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" autoFocus value={name} onChange={(e) => setName(e.target.value)} error={error?.field("name")} />
            <TextField label="Mobile number" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} error={error?.field("phone") ?? (error && !Object.keys(error.fieldErrors).length ? error.message : undefined)} />
          </div>
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Back
            </Button>
            <Button loading={busy} onClick={create} disabled={!name || !mobile}>
              Save customer
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------- Held sales ---------------- */
type Held = { id: number; label: string | null; cart: HeldCart; created_at: string; customer: { name: string } | null };

export function HeldSalesDialog({ open, onClose, onResume }: { open: boolean; onClose: () => void; onResume: (cart: HeldCart, id: number) => void }) {
  const toast = useToast();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["pos", "held"], queryFn: () => apiGet<{ data: Held[] }>("/admin/pos/held"), enabled: open });
  const [busy, setBusy] = useState<number | null>(null);

  async function resume(h: Held) {
    setBusy(h.id);
    try {
      const res = await apiSend<{ data: { cart: HeldCart } }>("post", `/admin/pos/held/${h.id}/resume`);
      onResume(res.data.cart, h.id);
      refetch();
      onClose();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Held sales" description="Carts put aside while a customer steps away.">
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No held sales" />
      ) : (
        <ul className="list-rows">
          {data.data.map((h) => (
            <li key={h.id}>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{h.label || h.customer?.name || "Walk-in"}</span>
                <span className="text-xs text-muted">
                  {h.cart.lines?.length ?? h.cart.items.length} items · held {timeAgo(h.created_at)}
                </span>
              </span>
              <Button loading={busy === h.id} onClick={() => resume(h)}>
                Resume
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------------- Waiting for approval ---------------- */
export type ApprovalAsk = { type: "discount" | "rx_release"; amount?: number; medicines?: string[]; customer?: string };

/**
 * Creates the approval request, then checks every 3 s. When approved, onApproved(id) continues
 * the sale automatically. Managers/pharmacists decide from their Approvals or "My work" screens.
 */
export function ApprovalWaitDialog({ ask, onClose, onApproved }: { ask: ApprovalAsk | null; onClose: () => void; onApproved: (type: ApprovalAsk["type"], id: number) => void }) {
  const locale = useLocale();
  const [requestId, setRequestId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const done = useRef(false);

  const { data } = useQuery({
    queryKey: ["pos", "approval", requestId],
    queryFn: () => apiGet<{ data: Approval }>(`/admin/approvals/${requestId}`),
    enabled: !!requestId,
    refetchInterval: 3000,
  });
  const status = data?.data.status;

  useEffect(() => {
    if (status === "approved" && requestId && ask && !done.current) {
      done.current = true;
      onApproved(ask.type, requestId);
    }
  }, [status, requestId, ask, onApproved]);

  if (!ask) return null;
  const who = ask.type === "discount" ? "the manager" : "the pharmacist";

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await apiSend<{ data: Approval }>("post", "/admin/approvals", {
        type: ask!.type,
        amount: ask!.type === "discount" ? ask!.amount : undefined,
        reason: reason || undefined,
        data: { customer: ask!.customer, medicines: ask!.medicines },
      });
      done.current = false;
      setRequestId(res.data.id);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ask.type === "discount" ? `Ask the manager for ${ask.amount}% discount` : "Ask the pharmacist to release Rx medicine"}
      description={ask.type === "discount" ? "Discounts above your limit need a manager’s OK." : `Only a pharmacist can release: ${ask.medicines?.join(", ")}.`}
      size="sm"
    >
      {!requestId ? (
        <>
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ask.type === "discount" ? "e.g. regular customer" : "e.g. prescription shown at counter"} />
          {error && <p className="field-error m-0">{error}</p>}
          <div className="modal-footer">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={sending} onClick={send}>
              Send request
            </Button>
          </div>
        </>
      ) : status === "rejected" ? (
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <XCircle size={36} className="text-rx" aria-hidden="true" />
          <p className="m-0 font-medium">Rejected{data?.data.decided_by ? ` by ${data.data.decided_by.name}` : ""}</p>
          {data?.data.decision_note && <p className="m-0 text-sm text-muted">{data.data.decision_note}</p>}
          <Button onClick={onClose}>OK</Button>
        </div>
      ) : status === "approved" ? (
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <CheckCircle2 size={36} className="text-brand dark:text-brand-line" aria-hidden="true" />
          <p className="m-0 font-medium">Approved — finishing the sale…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center" role="status" lang={locale}>
          <Clock3 size={36} className="text-pending" aria-hidden="true" />
          <p className="m-0 font-medium">Waiting for {who}…</p>
          <p className="m-0 text-sm text-muted">This sale finishes on its own as soon as it’s approved. You can serve the next customer meanwhile by holding this sale.</p>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}
