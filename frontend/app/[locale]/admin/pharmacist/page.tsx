"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Snowflake, ThermometerSnowflake } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { EmptyRow, ExpiryPill, KpiTile, Panel } from "@/components/admin/Blocks";
import { RequireModule } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { PageHeader } from "@/components/admin/AdminHeader";
import { TextField } from "@/components/ui/Field";
import { ErrorState, Notice, PageLoader } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { Link } from "@/i18n/navigation";
import { approvalTitle, type BatchRow, type PharmacistDashboard } from "@/lib/admin-types";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime, minutesAgo, timeAgo } from "@/lib/format";

export default function PharmacistPage() {
  return (
    <RequireModule module="rx">
      <PharmacistHome />
    </RequireModule>
  );
}

/** What to do with a batch, by how close it is to expiry (design: "Expiry actions this week"). */
function expiryAction(b: BatchRow) {
  if (b.days_to_expiry <= 0) return "Remove from shelf, return to supplier";
  if (b.days_to_expiry < 30) return "Sell first, tell customers";
  return `Move to front of rack${b.rack ? ` ${b.rack}` : ""}`;
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dhaka" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function PharmacistHome() {
  const locale = useLocale();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "pharmacist"],
    queryFn: () => apiGet<PharmacistDashboard>("/admin/dashboard/pharmacist"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Couldn’t load your work." onRetry={() => refetch()} />;
  const k = data.kpis;

  async function decide(id: number, decision: "approve" | "reject") {
    setBusyId(id);
    try {
      await apiSend("post", `/admin/approvals/${id}/${decision}`);
      toast.success(decision === "approve" ? "Released — the cashier can finish the sale" : "Request rejected");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["badges"] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        subtitle={`Pharmacist on duty${user?.shift ? ` · ${user.shift} shift` : ""}`}
        actions={
          <Link href="/admin/inventory" className="btn-ghost">
            Medicine lookup
          </Link>
        }
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiTile label="Prescriptions waiting" value={k.rx_waiting} sub={k.rx_oldest_at ? `Oldest ${timeAgo(k.rx_oldest_at)}` : "Queue is clear"} tone={k.rx_waiting ? "alert" : "neutral"} href="/admin/prescriptions" />
        <KpiTile label="Verified today" value={k.verified_online_today + k.released_at_counter_today} sub={`${k.verified_online_today} online · ${k.released_at_counter_today} at counter`} />
        <KpiTile label="Rejected today" value={k.rejected_today} sub="Customer asked for new Rx" />
        <KpiTile label="Expiring ≤ 30 days" value={k.expiring_30} sub="Batches to pull from shelf" tone={k.expiring_30 ? "danger" : "neutral"} href="/admin/expiry" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel title="Counter is waiting for you" action={data.counter_requests.length > 0 && <span className="badge-warn">{data.counter_requests.length} requests</span>}>
          {data.counter_requests.length === 0 ? (
            <EmptyRow>No requests from the counter.</EmptyRow>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.counter_requests.map((a) => (
                <li key={a.id} className="tile flex flex-col gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{approvalTitle(a)}</span>
                    <span className="text-sm text-muted">
                      {a.requested_by?.name} · {timeAgo(a.created_at)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" loading={busyId === a.id} onClick={() => decide(a.id, "reject")}>
                      Reject
                    </Button>
                    <Button loading={busyId === a.id} onClick={() => decide(a.id, "approve")}>
                      Approve release
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Online prescriptions to verify" action={<Link href="/admin/prescriptions" className="text-sm font-medium">Open queue</Link>}>
          {data.rx_queue.length === 0 ? (
            <EmptyRow>Nothing waiting. Well done.</EmptyRow>
          ) : (
            <ul className="list-rows">
              {data.rx_queue.map((o) => {
                const age = minutesAgo(o.placed_at);
                return (
                  <li key={o.id}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {o.code} · {(o as { customer?: { name: string } | null }).customer?.name ?? o.recipient_name}
                      </span>
                      <span className="text-xs text-muted">
                        {o.items_count} item{o.items_count === 1 ? "" : "s"}
                        {o.rx_items_count ? ` · ${o.rx_items_count} need${o.rx_items_count === 1 ? "s" : ""} Rx` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`text-sm whitespace-nowrap ${age >= 30 ? "font-bold text-rx" : "text-muted"}`}>{timeAgo(o.placed_at)} waiting</span>
                      <Link href={`/admin/orders?search=${encodeURIComponent(o.code)}`} className="btn-primary h-9 px-3 text-sm">
                        Verify
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Expiry actions this week">
          {data.expiry_actions.length === 0 ? (
            <EmptyRow>No batches need action.</EmptyRow>
          ) : (
            <ul className="list-rows">
              {data.expiry_actions.map((b) => (
                <li key={b.id}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {b.medicine?.name} · {b.batch_no}
                    </span>
                    <span className="text-xs text-muted">{expiryAction(b)}</span>
                  </span>
                  <ExpiryPill level={b.expiry_level} days={b.days_to_expiry} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={<span className="inline-flex items-center gap-2"><Snowflake size={18} aria-hidden="true" />Cold-chain storage</span>}>
          <dl className="summary-list">
            <dt>Fridge temperature</dt>
            <dd className={data.fridge && (Number(data.fridge.temperature) < 2 || Number(data.fridge.temperature) > 8) ? "font-bold text-rx" : "font-bold"}>
              {data.fridge ? `${data.fridge.temperature} °C` : "Not logged yet"}
            </dd>
            <dt>Last checked</dt>
            <dd>{data.fridge ? `${dateTime(data.fridge.recorded_at, locale)}${data.fridge.user ? ` by ${data.fridge.user.name.split(" ")[0]}` : ""}` : "—"}</dd>
          </dl>
          <p className="m-0 text-sm text-muted">Insulin and vaccines must stay at 2–8 °C. Log the reading at the start and end of each shift.</p>
          <div>
            <Button variant="outline" icon={<ThermometerSnowflake size={18} aria-hidden="true" />} onClick={() => setFridgeOpen(true)}>
              Log temperature
            </Button>
          </div>
        </Panel>
      </div>

      {fridgeOpen && <FridgeDialog onClose={() => setFridgeOpen(false)} />}
    </div>
  );
}

function FridgeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(temp);
  const outOfRange = temp !== "" && (value < 2 || value > 8);

  async function save() {
    setBusy(true);
    try {
      const res = await apiSend<{ out_of_range: boolean }>("post", "/admin/temperature-logs", { temperature: value, note: note || undefined });
      queryClient.invalidateQueries({ queryKey: ["admin", "pharmacist"] });
      if (res.out_of_range) toast.error("Fridge out of range", "The owner has been notified in the activity log.");
      else toast.success("Temperature logged");
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Log fridge temperature" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={temp === ""} onClick={save}>Save</Button></>}>
      <TextField label="Temperature (°C)" inputMode="decimal" autoFocus value={temp} onChange={(e) => setTemp(e.target.value.replace(/[^\d.-]/g, ""))} />
      {outOfRange && <Notice tone="rx" title="Outside 2–8 °C">Move insulin and vaccines to the backup fridge and tell the owner.</Notice>}
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="field-error m-0">{error}</p>}
    </Modal>
  );
}
