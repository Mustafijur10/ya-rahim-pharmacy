"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";
import { ChipTabs } from "@/components/ui/Data";
import { apiGet } from "@/lib/api";
import type { Category, MedicineCard, Paginated } from "@/lib/types";
import { ProductGrid, ProductGridSkeleton } from "./ProductCard";

/** "Most ordered medicines" with the All / Fever & pain / Gastric / Allergy chips. */
export default function MostOrdered({ initial, filters }: { initial: MedicineCard[]; filters: Category[] }) {
  const locale = useLocale();
  const [tab, setTab] = useState("all");

  const { data, isFetching } = useQuery({
    queryKey: ["most-ordered", tab],
    queryFn: () => apiGet<Paginated<MedicineCard>>("/store/medicines", { category: tab, per_page: 8, sort: "popular" }),
    enabled: tab !== "all",
    staleTime: 5 * 60_000,
  });

  const items = tab === "all" ? initial.slice(0, 8) : (data?.data ?? []);

  return (
    <div className="flex flex-col gap-5">
      <ChipTabs
        label="Filter most ordered medicines"
        value={tab}
        onChange={setTab}
        items={[{ key: "all", label: "All" }, ...filters.slice(0, 5).map((f) => ({ key: f.slug, label: locale === "bn" && f.name_bn ? f.name_bn : f.name }))]}
      />
      {tab !== "all" && isFetching && !data ? <ProductGridSkeleton count={4} /> : <ProductGrid items={items} locale={locale} />}
    </div>
  );
}
