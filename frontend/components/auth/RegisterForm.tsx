"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import type { DeliveryArea } from "@/lib/types";
import { savePendingOtp } from "./otp-session";
import PhoneInput, { toLocalPhone } from "./PhoneInput";

/** No password needed — the mobile number is verified by SMS (design: "Create your account"). */
export default function RegisterForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const areas = useQuery({ queryKey: ["delivery-areas"], queryFn: () => apiGet<{ data: DeliveryArea[] }>("/store/delivery-areas") });
  const [form, setForm] = useState({ name: "", phone: "", email: "", delivery_area_id: "", reminders: "yes" as "yes" | "no", agree: false });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.agree) {
      setError(new ApiError("Please agree to the terms and privacy policy.", 422));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ phone: string; expires_in: number; resend_in: number }>("post", "/auth/otp/request", { phone: toLocalPhone(form.phone) });
      savePendingOtp({
        phone: res.phone,
        mode: "register",
        next,
        remember: true,
        name: form.name,
        email: form.email || undefined,
        delivery_area_id: form.delivery_area_id ? Number(form.delivery_area_id) : null,
        sms_reminders: form.reminders === "yes",
        sentAt: Date.now(),
        expiresIn: res.expires_in,
        resendIn: res.resend_in,
      });
      router.push("/verify");
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">Create your account</h1>
        <p className="m-0 text-ink-2">Takes less than a minute. No password needed — we verify your mobile number.</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && !error.field("phone") && <Notice tone="rx">{error.message}</Notice>}
        <TextField label="Full name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={error?.field("phone")} hint="Used for order updates and login. Never shared." />
        <TextField label="Email (optional)" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <SelectField label="Delivery area" value={form.delivery_area_id} onChange={(e) => setForm({ ...form, delivery_area_id: e.target.value })}>
          <option value="">Select area</option>
          {areas.data?.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">Do you buy medicines every month?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["yes", "Yes, remind me"],
                ["no", "Not now"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`choice min-h-11 items-center py-2 ${form.reminders === v ? "choice-selected" : ""}`}>
                <input type="radio" name="reminders" className="checkbox" checked={form.reminders === v} onChange={() => setForm({ ...form, reminders: v })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="checkbox-row">
          <input type="checkbox" className="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} />
          <span>
            I agree to the <Link href="/pages/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.
          </span>
        </label>
        <Button type="submit" variant="accent" size="lg" block loading={busy} className="rounded-full">
          Create account &amp; send code
        </Button>
      </form>
      <p className="m-0 text-center text-ink-2">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold">
          Log in
        </Link>
      </p>
    </>
  );
}
