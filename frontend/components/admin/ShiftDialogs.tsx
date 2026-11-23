"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import type { DrawerSummary } from "@/lib/admin-types";
import { ApiError, apiSend } from "@/lib/api";
import { taka } from "@/lib/format";

export function OpenShiftCard({ onOpened }: { onOpened?: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cash, setCash] = useState("5000");
  const [counter, setCounter] = useState("Counter 1");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("post", "/admin/shifts", { opening_cash: Number(cash.replace(/,/g, "")) || 0, counter_name: counter });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Shift opened");
      onOpened?.();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-pad flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-xl">Open your shift</h2>
        <p className="m-0 text-sm text-muted">Count the cash in the drawer before your first sale.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Opening cash (৳)" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d,]/g, ""))} error={error?.field("opening_cash")} />
        <TextField label="Counter" value={counter} onChange={(e) => setCounter(e.target.value)} />
      </div>
      {error && !error.field("opening_cash") && <p className="field-error m-0">{error.message}</p>}
      <div>
        <Button loading={busy} onClick={open}>
          Open shift
        </Button>
      </div>
    </section>
  );
}

export function CloseShiftDialog({ shiftId, drawer, open, onClose }: { shiftId: number; drawer: DrawerSummary; open: boolean; onClose: () => void }) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countedNum = Number(counted.replace(/,/g, ""));
  const diff = counted ? countedNum - drawer.expected_cash : 0;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("post", `/admin/shifts/${shiftId}/close`, { counted_cash: countedNum, note: note || undefined });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Shift closed", diff ? `Difference ${taka(diff, locale)} sent to the manager.` : "Cash matches.");
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close shift"
      description="Count the cash in the drawer. Any difference is sent to the manager."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!counted} onClick={close}>
            Close shift
          </Button>
        </>
      }
    >
      <dl className="summary-list">
        <dt>Opening cash</dt>
        <dd>{taka(drawer.opening_cash, locale)}</dd>
        <dt>Cash sales</dt>
        <dd>{taka(drawer.cash_sales, locale)}</dd>
        <dt>Cash refunds</dt>
        <dd>− {taka(drawer.cash_refunds, locale)}</dd>
        <dt className="summary-total">Expected in drawer</dt>
        <dd className="summary-total">{taka(drawer.expected_cash, locale)}</dd>
      </dl>
      <TextField label="Counted cash (৳)" inputMode="numeric" autoFocus value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.,]/g, ""))} />
      {counted && (
        <p className={`m-0 font-medium ${diff === 0 ? "text-brand dark:text-brand-line" : "text-rx"}`} role="status">
          {diff === 0 ? "Cash matches." : diff < 0 ? `Short by ${taka(-diff, locale)}` : `Over by ${taka(diff, locale)}`}
        </p>
      )}
      {diff !== 0 && counted && <TextField label="Reason for difference" value={note} onChange={(e) => setNote(e.target.value)} />}
      {error && <p className="field-error m-0">{error}</p>}
    </Modal>
  );
}
