/**
 * Money and dates the Bangladeshi way: lakh grouping (৳12,46,500) and Dhaka time.
 * Bangla pages use Bangla digits.
 */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(locale: string, decimals: number) {
  const key = `${locale}:${decimals}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

/** ৳1,215 — whole Taka unless the amount has paisa (৳55.20). */
export function taka(value: number | string | null | undefined, locale = "en"): string {
  const n = Number(value ?? 0);
  const decimals = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  return `৳${moneyFormatter(locale, decimals).format(n)}`;
}

export function number(value: number | string | null | undefined, locale = "en"): string {
  return moneyFormatter(locale, 0).format(Number(value ?? 0));
}

export function dateTime(value: string | null | undefined, locale = "en", withTime = true): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function date(value: string | null | undefined, locale = "en"): string {
  return dateTime(value, locale, false);
}

/** "14 min ago", "3 h ago", "2 d ago". */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/** 01712345678 → 01712-345678 */
export function phone(value: string | null | undefined): string {
  if (!value) return "—";
  return /^01\d{9}$/.test(value) ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}

/** Minutes since a timestamp (0 if missing). */
export function minutesAgo(value: string | null | undefined): number {
  return value ? Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)) : 0;
}

/** "Monday, 23 November 2026" in Dhaka time. */
export function todayLong(locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date());
}

/** "2:41 PM" in Dhaka time. */
export function clock(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" }).format(new Date(value)) : "—";
}

/** Whole days from today until a YYYY-MM-DD date (negative when past). */
export function daysUntil(isoDate: string): number {
  return Math.round((new Date(`${isoDate}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
}

/** Today's date in Dhaka as YYYY-MM-DD (for API date filters). */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}
