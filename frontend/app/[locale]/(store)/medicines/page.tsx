import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import CatalogBrowser from "@/components/store/CatalogBrowser";
import { ProductGridSkeleton } from "@/components/store/ProductCard";

export const metadata: Metadata = {
  title: "All medicines",
  description: "Search medicines by brand or generic name. Genuine stock, prices below MRP, same-day delivery or pickup.",
};

export default async function MedicinesPage({ params }: PageProps<"/[locale]/medicines">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "All medicines" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">All medicines</h1>
        <p className="m-0 max-w-2xl text-ink-2">Search by brand or generic name. Prescription (Rx) medicines need a valid prescription at checkout.</p>
      </header>
      <Suspense fallback={<ProductGridSkeleton />}>
        <CatalogBrowser typeLabel="Category" />
      </Suspense>
    </div>
  );
}
