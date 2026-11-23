"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { SelectField, TextField, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { ApiError, apiSend } from "@/lib/api";

const TOPICS = [
  ["availability", "Medicine availability"],
  ["order", "My order"],
  ["prescription", "Prescription question"],
  ["delivery", "Delivery"],
  ["feedback", "Complaint or feedback"],
  ["other", "Other"],
] as const;

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", topic: "availability", order_code: "", message: "", agree: false, website: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("post", "/store/contact", { ...form, email: form.email || undefined, order_code: form.order_code || undefined, website: form.website || undefined });
      setSent(true);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3" role="status">
        <CheckCircle2 size={36} className="text-brand dark:text-brand-line" aria-hidden="true" />
        <h3 className="m-0 text-xl">Message sent</h3>
        <p className="m-0 text-ink-2">Thank you. We’ll get back to you on {form.phone} within one working day.</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && !Object.keys(error.fieldErrors).length && <Notice tone="rx">{error.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={error?.field("name")} />
        <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="01XXX-XXXXXX" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={error?.field("phone")} />
        <TextField label="Email (optional)" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={error?.field("email")} />
        <SelectField label="Topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
          {TOPICS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        {form.topic === "order" && <TextField label="Order number (if any)" placeholder="ON-1042" value={form.order_code} onChange={(e) => setForm({ ...form, order_code: e.target.value })} />}
      </div>
      <TextareaField label="Message" rows={5} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} error={error?.field("message")} />
      {/* Honeypot: hidden from people, bots fill it in. */}
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </label>
      </div>
      <label className="checkbox-row items-start">
        <input type="checkbox" className="checkbox mt-0.5" required checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} />
        <span>
          I agree to the <Link href="/privacy">privacy policy</Link>. Please don’t send prescriptions or health details here — use WhatsApp or upload at checkout.
        </span>
      </label>
      {error?.field("agree") && <span className="field-error">{error.field("agree")}</span>}
      <div>
        <Button type="submit" loading={busy} icon={<Send size={18} aria-hidden="true" />}>
          Send message
        </Button>
      </div>
    </form>
  );
}
