"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/admin/AdminHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { APPROVER, approvalTitle, type Approval } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime, timeAgo } from "@/lib/format";

type Row = Approval & { requested_by?: { id: number; name: string; role_label?: string | null } };
type ListResponse = { data: Row[]; can_decide: Approval["type"][]; pending_counts: Partial<Record<Approval["type"], number>> };

const FILTERS: { key: Approval["type"] | "all"; label: string }[] = [
  { key: "all", label: "Waiting" },
  { key: "discount", label: "Discounts" },
  { key: "refund", label: "Refunds" },
  { key: "stock_adjustment", label: "Stock changes" },
  { key: "rx_release", label: "Rx releases" },
];

/** Approvals (design: "Admin — Approvals"): waiting requests as cards, then recent decisions. */
export default function ApprovalsPage() {
  const locale = useLocale();
  const { can } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const type = filter === "all" ? undefined : filter;

  const pending = useQuery({
    queryKey: ["admin", "approvals", "pending", type],
    queryFn: () => apiGet<ListResponse>("/admin/approvals", { status: "pending", type }),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  });
  const decided = useQuery({
    queryKey: ["admin", "approvals", "decided", type],
    queryFn: () => apiGet<ListResponse>("/admin/approvals", { status: "decided", type }),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  if (pending.isLoading) return <PageLoader />;
  if (pending.isError || !pending.data) return <ErrorState message="Couldn’t load approvals." onRetry={() => pending.refetch()} />;
  const counts = pending.data.pending_counts ?? {};
  const totalWaiting = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Approvals"
        subtitle="Requests from staff that need a Manager, Pharmacist or Super admin decision"
        actions={
          can("staff", "full") ? (
            <Link href="/admin/staff" className="btn-outline">
              Approval rules
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter requests">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? totalWaiting : (counts[f.key] ?? 0);
          return (
            <button key={f.key} type="button" aria-pressed={filter === f.key} className={filter === f.key ? "chip chip-brand" : "chip"} onClick={() => setFilter(f.key)}>
              {f.label}
              {(f.key === "all" || n > 0) && ` (${n})`}
            </button>
          );
        })}
      </div>

      {pending.data.data.length === 0 ? (
        <EmptyState title="Nothing waiting" description="New requests from the counter and the store room appear here straight away." />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.data.data.map((a) => (
            <ApprovalCard key={a.id} a={a} canDecide={pending.data!.can_decide.includes(a.type)} />
          ))}
        </div>
      )}

      <section className="panel p-0!" aria-labelledby="decisions-title">
        <div className="border-b border-solid border-line px-4 py-3.5">
          <h2 id="decisions-title" className="m-0 text-base font-bold">
            Recent decisions
          </h2>
        </div>
        <div className="table-wrap table-wrap-flat">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Asked by</th>
                <th scope="col">Decision</th>
                <th scope="col">By</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {(decided.data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No decisions yet.
                  </td>
                </tr>
              )}
              {decided.data?.data.slice(0, 15).map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{approvalTitle(a)}</td>
                  <td className="text-ink-2">{a.requested_by?.name.split(" ")[0]}</td>
                  <td className={a.status === "approved" ? "text-ink-2" : "text-rx"}>
                    {a.status === "approved" ? "Approved" : "Rejected"}
                    {a.decision_note ? ` — ${a.decision_note}` : ""}
                  </td>
                  <td className="text-ink-2">{a.decided_by?.name.split(" ")[0] ?? "—"}</td>
                  <td className="text-ink-2">{a.decided_at ? dateTime(a.decided_at, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ApprovalCard({ a, canDecide }: { a: Row; canDecide: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const context = [a.data?.order, a.data?.customer, Array.isArray(a.data?.medicines) ? (a.data!.medicines as string[]).join(", ") : null, a.data?.medicine, a.reason].filter(Boolean).join(" · ");

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    try {
      await apiSend("post", `/admin/approvals/${a.id}/${kind}`, { note: note.trim() || null });
      toast.success(kind === "approve" ? "Approved" : "Rejected", approvalTitle(a));
      queryClient.invalidateQueries({ queryKey: ["admin", "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["badges"] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="approval-card">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <b className="text-base font-bold">{approvalTitle(a)}</b>
        <span className="text-[13px] text-muted">
          Asked by {a.requested_by?.name ?? "staff"}
          {a.requested_by?.role_label ? ` · ${a.requested_by.role_label}` : ""} · {timeAgo(a.created_at)}
        </span>
        {context && <span className="text-sm text-ink-2">{context}</span>}
      </div>
      {canDecide ? (
        <>
          <input className="input approval-note" placeholder="Note (optional)" aria-label={`Note for ${approvalTitle(a)}`} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-outline order-reject" disabled={busy !== null} onClick={() => decide("reject")}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <Button loading={busy === "approve"} disabled={busy !== null} onClick={() => decide("approve")}>
            Approve
          </Button>
        </>
      ) : (
        <span className="text-sm text-muted">Waiting for {APPROVER[a.type].toLowerCase()}</span>
      )}
    </article>
  );
}
