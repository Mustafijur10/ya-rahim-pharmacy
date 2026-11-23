"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { Notice, Spinner } from "@/components/ui/Feedback";
import { useRouter } from "@/i18n/navigation";
import { apiGet, apiSend, type ApiError } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/permissions";
import type { Features, User } from "@/lib/types";
import PinPad from "./PinPad";
import StaffLoginForm from "./StaffLoginForm";

type StaffTile = { id: number; name: string; full_name: string; initials: string; role_label: string | null; staff_note: string | null };

/** "Choose your name, then enter your 4-digit PIN." — counter login from the design. */
export default function StaffPinLogin() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { setUser } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["staff-directory"], queryFn: () => apiGet<{ data: StaffTile[] }>("/auth/staff/directory") });
  const [selected, setSelected] = useState<StaffTile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"pin" | "password">("pin");

  // Log in as soon as the 4th digit is entered.
  function onPinChange(v: string) {
    setPin(v);
    if (v.length === 4) submit(v);
  }

  async function submit(value = pin) {
    if (!selected || value.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: User; features: Features }>("post", "/auth/staff/login", { user_id: selected.id, pin: value, remember: false });
      setUser(res.user, res.features);
      const home = homeFor(res.user);
      const target = safeNext(next, home);
      router.replace(target.startsWith("/admin") || target.startsWith("/rider") ? target : home);
    } catch (e) {
      const err = e as ApiError;
      setError(err.field("login") ?? err.message);
      setPin("");
      setBusy(false);
    }
  }


  return (
    <div className="staff-login">
      <section className="staff-login-people">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-3xl text-white">Staff login</h1>
          <span className="text-[#D9CCE3]">Choose your name, then enter your 4-digit PIN.</span>
        </div>
        {isLoading ? (
          <Spinner label="Loading staff…" />
        ) : (
          <div className="staff-tiles" role="radiogroup" aria-label="Who are you?">
            {data?.data.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected?.id === s.id}
                className={`staff-tile ${selected?.id === s.id ? "staff-tile-active" : ""}`}
                onClick={() => {
                  setSelected(s);
                  setPin("");
                  setError(null);
                  setMode("pin");
                }}
              >
                <span className="staff-tile-avatar">{s.initials}</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-[#D9CCE3]">{s.role_label}</span>
              </button>
            ))}
          </div>
        )}
        <span className="mt-auto text-sm text-[#B9AEC2]">Each person has their own PIN — no shared logins at the counter.</span>
      </section>

      <section className="staff-login-pad">
        {mode === "password" ? (
          <div className="flex w-full max-w-sm flex-col gap-5">
            <h2 className="m-0 text-xl">Sign in with phone or email</h2>
            <StaffLoginForm />
            <button type="button" className="link-button text-sm" onClick={() => setMode("pin")}>
              ← Back to PIN login
            </button>
          </div>
        ) : selected ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-5">
            <span className="avatar avatar-xl">{selected.initials}</span>
            <div className="text-center">
              <div className="text-xl font-bold">{selected.full_name}</div>
              <span className="text-sm text-muted">
                {selected.role_label}
                {selected.staff_note ? ` · ${selected.staff_note}` : ""}
              </span>
            </div>
            <PinPad value={pin} onChange={onPinChange} onSubmit={() => submit()} disabled={busy} />
            {error && <Notice tone="rx">{error}</Notice>}
            <Button variant="accent" size="lg" block loading={busy} disabled={pin.length < 4} onClick={() => submit()} className="rounded-full">
              Log in
            </Button>
            <span className="text-center text-sm text-muted">Forgot PIN? Ask the Manager to reset it.</span>
          </div>
        ) : (
          <div className="flex max-w-xs flex-col items-center gap-3 text-center">
            <p className="m-0 text-lg font-medium">Choose your name to start</p>
            <p className="m-0 text-sm text-muted">Owners and managers can also sign in with phone or email and password.</p>
          </div>
        )}
        {mode === "pin" && (
          <button type="button" className="link-button text-sm" onClick={() => setMode("password")}>
            Use phone &amp; password instead
          </button>
        )}
      </section>
    </div>
  );
}
