"use client";

import { FileUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, apiSend } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { savePendingOtp } from "./otp-session";
import PhoneInput, { toLocalPhone } from "./PhoneInput";

export default function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { setUser } = useAuth();
  const [mode, setMode] = useState<"sms" | "password">("sms");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const local = toLocalPhone(phone);
    try {
      if (mode === "sms") {
        const res = await apiSend<{ phone: string; expires_in: number; resend_in: number }>("post", "/auth/otp/request", { phone: local });
        savePendingOtp({ phone: res.phone, mode: "login", next, remember, sentAt: Date.now(), expiresIn: res.expires_in, resendIn: res.resend_in });
        router.push("/verify");
      } else {
        const res = await apiSend<{ user: User }>("post", "/auth/customer/login", { phone: local, password, remember });
        setUser(res.user);
        router.replace(safeNext(next, homeFor(res.user)));
      }
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">Log in</h1>
        <p className="m-0 text-ink-2">Welcome back. Your orders and prescriptions are waiting.</p>
      </div>

      <div role="tablist" aria-label="Sign-in method" className="segmented">
        {(
          [
            ["sms", "Mobile + SMS code"],
            ["password", "Password"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={mode === key} className={`segmented-option ${mode === key ? "segmented-option-active" : ""}`} onClick={() => { setMode(key); setError(null); }}>
            {label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && !error.field("phone") && <Notice tone="rx">{error.message}</Notice>}
        <PhoneInput value={phone} onChange={setPhone} error={error?.field("phone")} hint={mode === "sms" ? "We’ll send a 6-digit code by SMS." : undefined} autoFocus />
        {mode === "password" && <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        <Button type="submit" variant="accent" size="lg" block loading={busy} className="rounded-full">
          {mode === "sms" ? "Send code" : "Log in"}
        </Button>
        <Checkbox label="Keep me logged in on this device" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      </form>

      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Link href="/upload-prescription" className="btn-ghost btn-lg rounded-full font-medium">
        <FileUp size={18} aria-hidden="true" />
        Order with prescription as guest
      </Link>
      <p className="m-0 text-center text-ink-2">
        New to Ya Rahim?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-bold">
          Create an account
        </Link>
      </p>
      <p className="m-0 text-center text-sm">
        <Link href="/staff/login" className="text-muted">
          Staff sign-in
        </Link>
      </p>
    </>
  );
}
