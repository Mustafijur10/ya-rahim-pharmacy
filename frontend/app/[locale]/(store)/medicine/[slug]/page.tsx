import { FileUp, MapPin, Phone, Pill, Snowflake, Truck } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import ProductBuyBox from "@/components/store/ProductBuyBox";
import ProductInfoTabs from "@/components/store/ProductInfoTabs";
import { PageLoader } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { taka } from "@/lib/format";
import { filled, getMedicine, getStoreInfo } from "@/lib/store-data";

export async function generateMetadata({ params }: PageProps<"/[locale]/medicine/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMedicine(slug);
  // Streamed pages can't change the HTTP status, so unknown products are kept out of search engines instead.
  if (!m) return { title: "Medicine not found", robots: { index: false, follow: false } };
  return {
    title: m.full_name,
    description: `${m.full_name}${m.generic ? ` (${m.generic.name})` : ""}${m.company ? ` by ${m.company.name}` : ""}${m.price ? ` — ${taka(m.price.price)} per ${m.pack?.short_name ?? "pack"}` : ""}. Genuine stock at Ya Rahim Pharmacy.`,
  };
}

export default function MedicinePage({ params }: PageProps<"/[locale]/medicine/[slug]">) {
  return (
    <div className="container-page flex flex-col gap-6 py-6">
      <Suspense fallback={<PageLoader />}>
        <MedicineContent params={params} />
      </Suspense>
    </div>
  );
}

async function MedicineContent({ params }: { params: PageProps<"/[locale]/medicine/[slug]">["params"] }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [m, store, lang] = await Promise.all([getMedicine(slug), getStoreInfo(), getLocale()]);
  if (!m) notFound();
  const phone = filled(store.phone);

  return (
    <>
      <Breadcrumbs
        items={[
          ...(m.category ? [{ label: m.category.name, href: `/category/${m.category.slug}` }] : [{ label: "Medicines", href: "/medicines" }]),
          { label: m.full_name },
        ]}
      />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div className="flex flex-col gap-3">
          <div className="product-hero-photo">
            {m.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- product photos come from the API
              <img src={m.image} alt={m.full_name} className="h-full w-full object-contain" />
            ) : (
              <>
                <Pill size={72} strokeWidth={1.2} aria-hidden="true" />
                <span className="text-sm text-muted">Product photo coming soon</span>
              </>
            )}
          </div>
        </div>

        {/* Info + buy */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {m.rx_required && <span className="badge-rx">Rx required</span>}
            {m.in_stock ? (
              <span className="badge-stock">
                In stock — {m.packs_in_stock} {m.pack ? `${m.pack.short_name}${m.packs_in_stock === 1 ? "" : "s"}` : ""}
              </span>
            ) : (
              <span className="badge-neutral">Out of stock</span>
            )}
            {m.is_cold_chain && (
              <span className="badge-neutral">
                <Snowflake size={12} aria-hidden="true" className="mr-1" />
                Keep refrigerated
              </span>
            )}
          </div>
          <h1 className="m-0 text-3xl leading-tight md:text-4xl">{m.full_name}</h1>
          <div className="flex flex-col gap-1">
            {m.generic && (
              <span>
                Generic:{" "}
                <Link href={{ pathname: "/medicines", query: { search: m.generic.name } }} className="font-medium">
                  {m.generic.name} {m.strength}
                </Link>
              </span>
            )}
            {m.company && <span className="text-muted">Manufacturer: {m.company.name}</span>}
          </div>

          <ProductBuyBox medicine={m} />

          {m.rx_required && (
            <div className="notice-warn">
              <FileUp size={22} aria-hidden="true" className="flex-none" />
              <div className="flex flex-col gap-1">
                <span className="font-bold">Prescription needed at checkout</span>
                <span>Upload a photo of your prescription. Our pharmacist verifies it before your order is packed.</span>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="tile flex items-center gap-3">
              <Truck size={22} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
              <span className="text-sm">
                <b>Delivery today</b>
                <br />
                <span className="text-muted">{filled(store.same_day_cutoff) ? `Order before ${store.same_day_cutoff}` : "Same-day in our delivery areas"}</span>
              </span>
            </div>
            <div className="tile flex items-center gap-3">
              <MapPin size={22} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
              <span className="text-sm">
                <b>Pick up in shop</b>
                <br />
                <span className="text-muted">Ready in 30 minutes</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-8 pt-6 lg:grid-cols-[1fr_360px]">
        <ProductInfoTabs medicine={m} />

        <aside className="flex flex-col gap-4">
          {m.alternatives.length > 0 && (
            <section className="card-pad flex flex-col gap-3">
              <h2 className="m-0 text-lg">Same generic, other brands</h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {m.alternatives.map((a) => (
                  <li key={a.id} className="alt-row">
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/medicine/${a.slug}`} className="truncate font-medium text-ink">
                        {a.full_name}
                      </Link>
                      <span className="text-sm text-muted">{a.company?.name}</span>
                    </span>
                    {a.price && (
                      <span className="flex flex-none flex-col items-end">
                        <span className="font-bold">{taka(a.price.price, lang)}</span>
                        <span className="text-xs text-muted">per {a.pack?.short_name ?? "pack"}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="m-0 text-sm text-muted">Switch brands only on your doctor’s or pharmacist’s advice.</p>
            </section>
          )}
          <section className="notice-brand flex-col">
            <h2 className="m-0 text-lg">Questions about this medicine?</h2>
            <p className="m-0 text-sm text-ink-2">Talk to our pharmacist during shop hours.</p>
            {phone ? (
              <a href={`tel:${phone}`} className="btn-primary w-full">
                <Phone size={18} aria-hidden="true" />
                Call {phone}
              </a>
            ) : (
              <Link href="/contact" className="btn-primary w-full">
                Contact the pharmacist
              </Link>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
