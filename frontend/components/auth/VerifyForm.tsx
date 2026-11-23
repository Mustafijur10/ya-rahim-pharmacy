"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { Notice, PageLoader } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, apiSend } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { clearPendingOtp, readPendingOtp, savePendingOtp, type PendingOtp } from "./otp-session";

const LENGTH = 6;

function mmss(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Six single-digit boxes (paste fills all), expiry + resend countdowns. */
export default function VerifyForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [pending, setPending] = useState<PendingOtp | null | undefined>(undefined);
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = readPendingOtp();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the hand-off from Log in / Register once
    setPending(p);
    if (!p) router.replace("/login");
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (pending === undefined || pending === null) return <PageLoader />;

  const elapsed = Math.floor((now - pending.sentAt) / 1000);
  const expiresIn = pending.expiresIn - elapsed;
  const resendIn = pending.resendIn - elapsed;
  const code = digits.join("");

  function setDigit(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pasted or autofilled the whole code.
      const all = clean.slice(0, LENGTH).split("");
      setDigits([...all, ...Array(LENGTH - all.length).fill("")]);
      boxes.current[Math.min(all.length, LENGTH - 1)]?.focus();
      if (all.length === LENGTH) verify(all.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < LENGTH - 1) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  }

  async function verify(value = code) {
    if (value.length !== LENGTH || busy || !pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: User }>("post", "/auth/otp/verify", {
        phone: pending.phone,
        code: value,
        remember: pending.remember,
        name: pending.name || undefined,
        email: pending.email || undefined,
        delivery_area_id: pending.delivery_area_id ?? undefined,
        sms_reminders: pending.mode === "register" ? pending.sms_reminders : undefined,
      });
      clearPendingOtp();
      setUser(res.user);
      router.replace(safeNext(pending.next, homeFor(res.user)));
    } catch (e) {
      setError(e as ApiError);
      setDigits(Array(LENGTH).fill(""));
      boxes.current[0]?.focus();
      setBusy(false);
    }
  }

  async function resend() {
    if (!pending) return;
    try {
      const res = await apiSend<{ expires_in: number; resend_in: number }>("post", "/auth/otp/request", { phone: pending.phone });
      const updated = { ...pending, sentAt: Date.now(), expiresIn: res.expires_in, resendIn: res.resend_in };
      savePendingOtp(updated);
      setPending(updated);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    }
  }

  const shown = `+880 ${pending.phone.slice(1, 5)}-${pending.phone.slice(5)}`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">Enter the code</h1>
        <p className="m-0 text-ink-2">
          We sent a 6-digit code to <b>{shown}</b>.{" "}
          <Link href={pending.mode === "register" ? "/register" : "/login"} className="font-medium">
            Change number
          </Link>
        </p>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-3 text-sm font-medium">6-digit code</legend>
          <div className="otp-boxes">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                className={`otp-box ${error ? "otp-box-invalid" : ""}`}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1}`}
                maxLength={i === 0 ? LENGTH : 1}
                value={d}
                autoFocus={i === 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
          <span>{expiresIn > 0 ? `Code expires in ${mmss(expiresIn)}` : "The code has expired."}</span>
          {resendIn > 0 ? (
            <span>Didn’t get it? Resend in {mmss(resendIn)}</span>
          ) : (
            <button type="button" className="link-button" onClick={resend}>
              Send a new code
            </button>
          )}
        </div>

        {error && <Notice tone="rx">{error.message}</Notice>}

        <Button type="submit" variant="accent" size="lg" block loading={busy} disabled={code.length !== LENGTH || expiresIn <= 0} className="rounded-full">
          Verify &amp; continue
        </Button>
        <p className="m-0 text-center text-sm text-muted">Ya Rahim Pharmacy will never call you to ask for this code. Don’t share it with anyone.</p>
      </form>
    </>
  );
}
