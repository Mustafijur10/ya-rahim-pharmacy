"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "yr-theme";

type ThemeContextValue = { theme: ThemeChoice; resolved: "light" | "dark"; setTheme: (t: ThemeChoice) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Runs before paint (from <head>) so the black theme never flashes white.
 * Kept as a string because it must run before React loads.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("light");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const apply = useCallback((t: ThemeChoice) => {
    const dark = t === "dark" || (t === "system" && systemDark());
    document.documentElement.classList.toggle("dark", dark);
    setResolved(dark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved choice once after mount
    setThemeState(saved);
    apply(saved);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? "light") === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [apply]);

  const setTheme = useCallback(
    (t: ThemeChoice) => {
      localStorage.setItem(STORAGE_KEY, t);
      setThemeState(t);
      apply(t);
    },
    [apply],
  );

  return <ThemeContext value={{ theme, resolved, setTheme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
