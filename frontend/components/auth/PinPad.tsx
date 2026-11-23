"use client";

import { Delete } from "lucide-react";
import { useEffect } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  length?: number;
  disabled?: boolean;
};

/**
 * PIN dots + 3×4 keypad from the staff-login design. The physical keyboard works too
 * (digits, Backspace, Enter), so it's quick at the counter and accessible.
 */
export default function PinPad({ value, onChange, onSubmit, length = 4, disabled }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (/^\d$/.test(e.key) && value.length < 6) onChange(value + e.key);
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter" && value.length >= length) onSubmit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit, length, disabled]);

  const dots = Math.max(length, value.length);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="pin-dots" role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className={`pin-dot ${i < value.length ? "pin-dot-filled" : ""}`} />
        ))}
      </div>
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="pin-key" disabled={disabled || value.length >= 6} onClick={() => onChange(value + d)}>
            {d}
          </button>
        ))}
        <button type="button" className="pin-key pin-key-text" disabled={disabled} onClick={() => onChange("")}>
          Clear
        </button>
        <button type="button" className="pin-key" disabled={disabled || value.length >= 6} onClick={() => onChange(value + "0")}>
          0
        </button>
        <button type="button" className="pin-key" disabled={disabled} onClick={() => onChange(value.slice(0, -1))} aria-label="Delete last digit">
          <Delete size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
