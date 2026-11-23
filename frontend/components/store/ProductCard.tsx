import { Pill, Snowflake } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { taka } from "@/lib/format";
import type { MedicineCard } from "@/lib/types";
import AddToCartButton from "./AddToCartButton";

/** Product card from the design: % OFF, Rx badge, generic, company · pack, price vs MRP, add to cart. */
export default function ProductCard({ medicine: m, locale = "en" }: { medicine: MedicineCard; locale?: string }) {
  const off = m.price && m.price.discount_percent > 0 ? Math.round(m.price.discount_percent) : 0;

  return (
    <article className="product-card">
      <Link href={`/medicine/${m.slug}`} className="product-photo" tabIndex={-1} aria-hidden="true">
        {m.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- product photos come from the API (Step 7 uploads)
          <img src={m.image} alt="" className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <Pill size={36} strokeWidth={1.4} />
        )}
        {off > 0 && <span className="product-off">{off}% OFF</span>}
      </Link>

      <div className="flex flex-wrap gap-1.5">
        {m.rx_required && <span className="badge-rx">Rx required</span>}
        {m.is_cold_chain && (
          <span className="badge-neutral">
            <Snowflake size={12} aria-hidden="true" className="mr-1" />
            Fridge
          </span>
        )}
        {m.stock_status === "low" && <span className="badge-warn">Low stock</span>}
        {m.stock_status === "out" && <span className="badge-neutral">Out of stock</span>}
      </div>

      <div className="flex min-h-[4.5rem] flex-col gap-0.5">
        <Link href={`/medicine/${m.slug}`} className="product-name">
          {m.full_name}
        </Link>
        {m.generic && <span className="text-sm text-muted">{m.generic.name}</span>}
        <span className="text-xs text-subtle">
          {[m.company?.name, m.pack?.name].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2">
        {m.price ? (
          <div className="flex flex-col">
            <span className="price text-lg">{taka(m.price.price, locale)}</span>
            {m.price.saving > 0 && <span className="price-mrp">MRP {taka(m.price.mrp, locale)}</span>}
          </div>
        ) : (
          <span className="text-sm text-muted">Price on request</span>
        )}
      </div>
      {m.price && <AddToCartButton medicine={m} pack={m.pack} price={m.price.price} mrp={m.price.mrp} />}
    </article>
  );
}

export function ProductGrid({ items, locale }: { items: MedicineCard[]; locale?: string }) {
  return (
    <div className="product-grid">
      {items.map((m) => (
        <ProductCard key={m.id} medicine={m} locale={locale} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="product-card">
          <span className="skeleton h-36 w-full" />
          <span className="skeleton h-4 w-3/4" />
          <span className="skeleton h-4 w-1/2" />
          <span className="skeleton mt-4 h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
