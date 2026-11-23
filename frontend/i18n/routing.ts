import { defineRouting } from "next-intl/routing";

// English at "/", Bangla at "/bn/…".
export const routing = defineRouting({
  locales: ["en", "bn"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeCookie: { name: "YR_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
