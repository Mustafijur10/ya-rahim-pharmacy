"use client";

import { Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useTransition } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * বাংলা | English switch. Keeps the current page.
 * Reading the URL is request-time data, so it renders inside its own Suspense boundary
 * (the fallback is the same switch, without the current page).
 */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<LanguageButtons className={className} pathname={null} />}>
      <LanguageSwitchWithPath className={className} />
    </Suspense>
  );
}

function LanguageSwitchWithPath({ className }: { className: string }) {
  return <LanguageButtons className={className} pathname={usePathname()} />;
}

function LanguageButtons({ className, pathname }: { className: string; pathname: string | null }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const [pending, start] = useTransition();

  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t("language")}>
      {(
        [
          ["bn", "বাংলা"],
          ["en", "English"],
        ] as const
      ).map(([code, label]) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={`lang-option ${locale === code ? "lang-option-active" : ""}`}
          aria-pressed={locale === code}
          disabled={pending || pathname === null}
          onClick={() => pathname !== null && start(() => router.replace(pathname, { locale: code }))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** White / black theme toggle (brand guide's two themes). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const t = useTranslations("common.theme");
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button type="button" className={`btn-icon btn-ghost ${className}`} onClick={() => setTheme(next)} aria-label={t(next)} title={t(next)}>
      {resolved === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
