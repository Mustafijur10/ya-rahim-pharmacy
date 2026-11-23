"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/Data";
import { useRouter } from "@/i18n/navigation";
import { apiGet } from "@/lib/api";
import { taka } from "@/lib/format";
import type { MedicineCard } from "@/lib/types";

/** Brand/generic search with suggestions (accessible combobox). */
export default function SearchBox({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("store");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const listId = useId();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLFormElement>(null);

  // Debounce typing by 200ms.
  useEffect(() => {
    const id = setTimeout(() => setTerm(value.trim()), 200);
    return () => clearTimeout(id);
  }, [value]);

  const { data } = useQuery({
    queryKey: ["suggest", term],
    queryFn: () => apiGet<{ data: MedicineCard[] }>("/store/medicines/suggest", { q: term }),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
  const results = term.length >= 2 ? (data?.data ?? []) : [];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(slug?: string) {
    setOpen(false);
    if (slug) router.push(`/medicine/${slug}`);
    else if (value.trim()) router.push({ pathname: "/medicines", query: { search: value.trim() } });
  }

  return (
    <form
      ref={boxRef}
      role="search"
      className={`search-box ${compact ? "search-box-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 ? results[active]?.slug : undefined);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id={inputId}
        type="search"
        className="search-input"
        placeholder={t("searchPlaceholder")}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button type="submit" className="search-button" aria-label={tc("search")}>
        <Search size={20} aria-hidden="true" />
      </button>

      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="search-results">
          {results.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search-result ${i === active ? "search-result-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                go(m.slug);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{m.full_name}</span>
                <span className="truncate text-sm text-muted">
                  {[m.generic?.name, m.company?.name].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex flex-none items-center gap-2">
                {m.rx_required && <Badge tone="rx">Rx</Badge>}
                {m.price && <span className="font-bold">{taka(m.price.price, locale)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
