"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { RequireModule } from "@/components/auth/Guards";
import PinPad from "@/components/auth/PinPad";
import { ME_KEY } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button from "@/components/ui/Button";
import { PageHeader } from "@/components/admin/AdminHeader";
import { Checkbox } from "@/components/ui/Field";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { dateTime } from "@/lib/format";

type Item = { key: string; label: string; help: string | null; core: boolean; requires: string | null; enabled: boolean };
type Group = { key: string; label: string; items: Item[] };
type Data = { groups: Group[]; recent: { id: number; description: string; created_at: string; causer: { name: string } | null }[] };

export default function ModulesPage() {
  return (
    <RequireModule module="modules">
      <Modules />
    </RequireModule>
  );
}

function Modules() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["admin", "modules"], queryFn: () => apiGet<Data>("/admin/modules") });
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [askPin, setAskPin] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Couldn’t load modules." onRetry={() => refetch()} />;

  const all = data.groups.flatMap((g) => g.items);
  const isOn = (key: string): boolean => {
    const item = all.find((i) => i.key === key);
    if (!item) return false;
    const on = key in changes ? changes[key] : item.enabled;
    return on && (!item.requires || isOn(item.requires));
  };
  const dirty = Object.keys(changes).length > 0;

  async function save(withPin?: string) {
    setBusy(true);
    setError(null);
    try {
      await apiSend("put", "/admin/modules", { features: changes, pin: withPin || undefined });
      setChanges({});
      setPinOpen(false);
      setPin("");
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ME_KEY })]);
      toast.success("Modules saved", "Changes apply to all staff and the website now.");
    } catch (e) {
      const err = e as ApiError;
      setError(err.field("pin") ?? err.message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modules & features"
        subtitle="Super admin only. Changes apply to every staff member and to the website immediately after saving."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => setChanges({})}>
                Discard
              </Button>
            )}
            <Button disabled={!dirty} loading={busy && !pinOpen} onClick={() => (askPin ? setPinOpen(true) : save())}>
              Save changes{dirty ? ` (${Object.keys(changes).length})` : ""}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {data.groups.map((g) => {
            const onCount = g.items.filter((i) => isOn(i.key)).length;
            return (
              <section key={g.key} className="card-pad flex flex-col gap-1">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="m-0 text-lg">{g.label}</h2>
                  <span className="text-sm text-muted">
                    {onCount} of {g.items.length} on
                  </span>
                </div>
                {g.items.map((i) => {
                  const blocked = !!i.requires && !isOn(i.requires);
                  const parent = all.find((p) => p.key === i.requires);
                  return (
                    <label key={i.key} className={`switch-row ${i.core || blocked ? "switch-row-disabled" : ""}`}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">{i.label}</span>
                        <span className="text-sm text-muted">
                          {i.core ? "Core — cannot be turned off" : blocked ? `Needs ${parent?.label}` : i.help}
                        </span>
                      </span>
                      <span className="text-sm text-muted">{isOn(i.key) ? "On" : "Off"}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="switch"
                        checked={isOn(i.key)}
                        disabled={i.core || blocked}
                        onChange={(e) =>
                          setChanges((c) => {
                            const next = { ...c, [i.key]: e.target.checked };
                            if (next[i.key] === i.enabled) delete next[i.key];
                            return next;
                          })
                        }
                      />
                    </label>
                  );
                })}
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="notice-brand flex-col">
            <span className="flex items-center gap-2 font-bold">
              <ShieldAlert size={18} aria-hidden="true" />
              Who can change this
            </span>
            <p className="m-0 text-sm text-ink-2">Only the Super admin sees this page. Managers and other staff don’t see the menu item.</p>
            <p className="m-0 text-sm text-ink-2">
              When a module is off: its menu items disappear for all staff, its pages are hidden on the website, and saved data is kept — turning it on again brings everything back.
            </p>
            <Checkbox label="Ask for my PIN before saving changes" checked={askPin} onChange={(e) => setAskPin(e.target.checked)} />
          </section>
          <section className="card-pad flex flex-col gap-3">
            <h2 className="m-0 text-lg">Recent changes</h2>
            {data.recent.length === 0 ? (
              <p className="m-0 text-sm text-muted">No changes yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex flex-col text-sm">
                    <span className="font-medium">{r.description}</span>
                    <span className="text-muted">
                      {r.causer?.name ?? "System"} · {dateTime(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <Modal open={pinOpen} onClose={() => { setPinOpen(false); setPin(""); setError(null); }} title="Confirm with your PIN" description="Module changes affect every staff member and the website." size="sm">
        <PinPad value={pin} onChange={setPin} onSubmit={() => save(pin)} disabled={busy} />
        {error && <p className="field-error m-0 text-center">{error}</p>}
        <Button block loading={busy} disabled={pin.length < 4} onClick={() => save(pin)}>
          Save changes
        </Button>
      </Modal>
    </div>
  );
}
