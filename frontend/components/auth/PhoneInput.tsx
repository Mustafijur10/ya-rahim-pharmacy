"use client";

import { useId } from "react";

/** "BD +880 | 17XX-XXXXXX" field from the designs. Accepts 01…, 1…, +8801… */
export default function PhoneInput({ value, onChange, error, hint, autoFocus }: { value: string; onChange: (v: string) => void; error?: string; hint?: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        Mobile number
      </label>
      <div className={`phone-input ${error ? "phone-input-invalid" : ""}`}>
        <span className="phone-prefix" aria-hidden="true">
          BD +880
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="17XX-XXXXXX"
          required
          autoFocus={autoFocus}
          className="phone-field"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+\- ]/g, ""))}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-help`}
        />
      </div>
      <span id={`${id}-help`} className={error ? "field-error" : "field-hint"} role={error ? "alert" : undefined}>
        {error ?? hint}
      </span>
    </div>
  );
}

/** "1712345678" / "01712345678" / "+8801712345678" → "01712345678" (server validates again). */
export function toLocalPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("880")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("1")) d = `0${d}`;
  return d;
}
