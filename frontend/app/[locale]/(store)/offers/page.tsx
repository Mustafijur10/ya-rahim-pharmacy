import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import CatalogBrowser from "@/components/store/CatalogBrowser";
import { ProductGridSkeleton } from "@/components/store/ProductCard";

export const metadata: Metadata = { title: "Offers", description: "Medicines and healthcare products below MRP." };

export default async function OffersPage({ params }: PageProps<"/[locale]/offers">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "Offers" }]} />
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">Offers</h1>
        <p className="m-0 max-w-2xl text-ink-2">Everything currently sold below MRP. Biggest discounts first.</p>
      </header>
      <Suspense fallback={<ProductGridSkeleton />}>
        <CatalogBrowser fixed={{ on_discount: "1", sort: "discount" }} typeLabel="Category" />
      </Suspense>
    </div>
  );
}
