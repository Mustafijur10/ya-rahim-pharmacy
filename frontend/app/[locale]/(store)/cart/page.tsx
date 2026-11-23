"use client";

import { FileUp, Minus, Pill, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState, Notice, PageLoader } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { taka } from "@/lib/format";
import { useQuote } from "@/lib/useQuote";

export default function CartPage() {
  const locale = useLocale();
  const { lines, ready, setQuantity, remove } = useCart();
  const { user } = useAuth();
  const { data: quote, isFetching } = useQuote(lines);

  if (!ready) return <PageLoader />;

  if (lines.length === 0) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title="Your cart is empty"
          description="Search for a medicine, or send us your prescription and our pharmacist will prepare the order."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/medicines" className={buttonClass("primary")}>
                Browse medicines
              </Link>
              <Link href="/upload-prescription" className={buttonClass("outline")}>
                Upload prescription
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const lineQuote = (id: number, pack: number | null) => quote?.lines.find((q) => q.medicine_id === id && q.pack_size_id === pack);
  const checkoutHref = user && !user.is_staff ? "/checkout" : "/login?next=/checkout";

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "Cart" }]} />
      <h1 className="m-0 text-3xl">Your cart</h1>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card flex flex-col" aria-label="Cart items">
          {lines.map((l) => {
            const q = lineQuote(l.medicine_id, l.pack_size_id);
            const problem = quote?.problems.find((p) => p.medicine_id === l.medicine_id);
            return (
              <article key={`${l.medicine_id}-${l.pack_size_id}`} className="cart-row">
                <span className="cart-thumb" aria-hidden="true">
                  <Pill size={24} strokeWidth={1.5} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={`/medicine/${l.slug}`} className="font-medium text-ink">
                    {l.name}
                  </Link>
                  <span className="text-sm text-muted">{l.pack_name}</span>
                  {l.rx_required && <span className="badge-rx self-start">Rx required</span>}
                  {problem && <span className="text-sm font-medium text-rx">{problem.message}</span>}
                </div>
                <div className="stepper stepper-sm" role="group" aria-label={`Quantity of ${l.name}`}>
                  <button type="button" className="stepper-button" onClick={() => setQuantity(l.medicine_id, l.pack_size_id, l.quantity - 1)} aria-label="Decrease quantity">
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <span className="stepper-value" aria-live="polite">
                    {l.quantity}
                  </span>
                  <button type="button" className="stepper-button" onClick={() => setQuantity(l.medicine_id, l.pack_size_id, l.quantity + 1)} aria-label="Increase quantity">
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex w-24 flex-col items-end">
                  <span className="font-bold">{taka(q?.total ?? l.price * l.quantity, locale)}</span>
                  {(q?.discount ?? 0) > 0 && <span className="price-mrp">{taka(q!.mrp_total, locale)}</span>}
                </div>
                <button type="button" className="btn-icon btn-ghost" onClick={() => remove(l.medicine_id, l.pack_size_id)} aria-label={`Remove ${l.name}`}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </section>

        <aside className="card-pad flex flex-col gap-4" aria-label="Order summary">
          <h2 className="m-0 text-xl">Order summary</h2>
          <dl className="summary-list">
            <dt>Subtotal (MRP)</dt>
            <dd>{taka(quote?.subtotal ?? 0, locale)}</dd>
            <dt>Discount</dt>
            <dd className="text-brand-dark dark:text-brand-line">− {taka(quote?.discount_total ?? 0, locale)}</dd>
            <dt>Delivery</dt>
            <dd className="text-muted">At checkout</dd>
            <dt className="summary-total">Total</dt>
            <dd className="summary-total">{taka((quote?.subtotal ?? 0) - (quote?.discount_total ?? 0), locale)}</dd>
          </dl>
          {quote?.requires_rx && (
            <Notice tone="warn" icon={<FileUp size={20} />} title={`Prescription needed for ${quote.rx_item_count} item${quote.rx_item_count > 1 ? "s" : ""}`}>
              You’ll upload it at checkout.
            </Notice>
          )}
          {quote && quote.problems.length > 0 && <Notice tone="rx">Some items are short on stock. Lower the quantity to continue.</Notice>}
          {quote && quote.problems.length === 0 ? (
            <Link href={checkoutHref} className={buttonClass("accent", "lg", true)} aria-disabled={isFetching}>
              Proceed to checkout
            </Link>
          ) : (
            <button type="button" className={buttonClass("accent", "lg", true)} disabled>
              Proceed to checkout
            </button>
          )}
          <Link href="/medicines" className="text-center text-sm">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
