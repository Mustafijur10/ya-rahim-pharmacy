import { Headset } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import CatalogBrowser from "@/components/store/CatalogBrowser";
import { ProductGridSkeleton } from "@/components/store/ProductCard";
import { buttonClass } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { getCategories } from "@/lib/store-data";

const INTROS: Record<string, string> = {
  healthcare: "Home health devices, first aid and daily care — checked for genuine stock and warranty, delivered or ready for pickup.",
  medicines: "Prescription and over-the-counter medicines from authorised distributors.",
  "medical-devices": "BP monitors, thermometers, glucometers and more — genuine stock with warranty.",
  "diabetes-care": "Insulin, test strips and everything for daily diabetes care. Fridge items delivered quickly.",
  vitamins: "Daily vitamins and supplements for the whole family.",
};

async function findCategory(slug: string) {
  const categories = await getCategories();
  for (const c of categories) {
    if (c.slug === slug) return { category: c, parent: null };
    const child = c.children?.find((ch) => ch.slug === slug);
    if (child) return { category: { ...child, children: [], medicines_count: 0 }, parent: c };
  }
  return null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await findCategory(slug);
  return found ? { title: found.category.name, description: INTROS[slug] ?? `${found.category.name} at Ya Rahim Pharmacy.` } : { title: "Category" };
}

export default function CategoryPage({ params }: PageProps<"/[locale]/category/[slug]">) {
  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Suspense fallback={<ProductGridSkeleton />}>
        <CategoryContent params={params} />
      </Suspense>
    </div>
  );
}

async function CategoryContent({ params }: { params: PageProps<"/[locale]/category/[slug]">["params"] }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = await findCategory(slug);
  if (!found) notFound();
  const lang = await getLocale();
  const { category, parent } = found;
  const name = lang === "bn" && category.name_bn ? category.name_bn : category.name;

  return (
    <>
      <Breadcrumbs items={[...(parent ? [{ label: parent.name, href: `/category/${parent.slug}` }] : []), { label: name }]} />
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl">{name}</h1>
        <p className="m-0 max-w-2xl text-ink-2">{INTROS[slug] ?? "Genuine stock from authorised distributors, delivered or ready for pickup."}</p>
      </header>

      {category.children?.length > 0 && (
        <nav aria-label={`${name} types`} className="flex gap-2 overflow-x-auto pb-1">
          <span className="chip chip-active">All {name.toLowerCase()}</span>
          {category.children.map((ch) => (
            <Link key={ch.id} href={`/category/${ch.slug}`} className="chip">
              {lang === "bn" && ch.name_bn ? ch.name_bn : ch.name}
            </Link>
          ))}
        </nav>
      )}

      <Suspense fallback={<ProductGridSkeleton />}>
        <CatalogBrowser fixed={{ category: slug }} />
      </Suspense>

      <div className="help-banner">
        <span className="trust-icon" aria-hidden="true">
          <Headset size={22} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-bold">Not sure which one to buy?</span>
          <span className="text-sm text-ink-2">Our pharmacist will help you choose — free of charge.</span>
        </div>
        <Link href="/contact" className={buttonClass("primary")}>
          Talk to a pharmacist
        </Link>
      </div>
    </>
  );
}
