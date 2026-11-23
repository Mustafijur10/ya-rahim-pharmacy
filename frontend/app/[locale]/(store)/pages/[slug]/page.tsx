import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import { Link } from "@/i18n/navigation";
import { getDeliveryAreas } from "@/lib/store-data";
import { taka } from "@/lib/format";

/** Help pages from the footer. Text in [brackets] is for the owner to fill in. */
const PAGES: Record<string, { title: string; intro: string; body: () => Promise<ReactNode> | ReactNode }> = {
  "how-to-order": {
    title: "How to order",
    intro: "Three ways to get your medicines from Ya Rahim Pharmacy.",
    body: () => (
      <>
        <h2>1. Search and add to cart</h2>
        <p>Search by brand (e.g. Napa) or generic name (e.g. Paracetamol). Choose the pack size, add to cart and check out. Prescription (Rx) medicines need a prescription photo at checkout.</p>
        <h2>2. Send your prescription</h2>
        <p>
          No time to search? <Link href="/upload-prescription">Upload your prescription</Link> — no account needed. Our pharmacist calls you to confirm the medicines and price.
        </p>
        <h2>3. Monthly refills</h2>
        <p>
          Save your prescription once and set up a <Link href="/account?tab=refills">monthly refill</Link>. We remind you by SMS a few days before it’s due and prepare it for delivery or pickup.
        </p>
        <h2>Delivery or pickup</h2>
        <p>Choose express or standard delivery, or pick up at the counter in about 30 minutes. Pay cash on delivery, or pay at the shop when you collect.</p>
      </>
    ),
  },
  delivery: {
    title: "Delivery areas & charges",
    intro: "Same-day delivery in the areas below. Pickup from the shop is always free.",
    body: async () => {
      const { data: areas, express_hours } = await getDeliveryAreas();
      return (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Standard (same day)</th>
                <th scope="col">Express (~{express_hours} h)</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{taka(a.standard_fee)}</td>
                  <td>{a.express_available && a.express_fee !== null ? taka(a.express_fee) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Fridge items (e.g. insulin) are delivered in a cool bag as quickly as possible. Our rider asks for the 4-digit code we SMS you — give it only when you receive the order.</p>
        </>
      );
    },
  },
  returns: {
    title: "Return & refund policy",
    intro: "We want you to be happy with every order.",
    body: () => (
      <>
        <h2>What can be returned</h2>
        <p>Unopened items in their original packaging, with the receipt or order number, within [days] days.</p>
        <h2>What can’t be returned</h2>
        <ul>
          <li>Fridge items (insulin, vaccines and similar)</li>
          <li>Opened strips, bottles or packs</li>
          <li>Items damaged after delivery</li>
        </ul>
        <h2>Wrong or damaged item?</h2>
        <p>
          Tell us within 24 hours and we’ll replace it free of charge. <Link href="/contact">Contact us</Link>.
        </p>
        <h2>Refunds</h2>
        <p>Refunds go back the way you paid (cash at the counter, or bKash/Nagad/card) once the return is approved by our manager.</p>
      </>
    ),
  },
  terms: {
    title: "Terms of service",
    intro: "The rules for buying from Ya Rahim Pharmacy online.",
    body: () => (
      <>
        <p>[Your terms of service. Have a lawyer review this text before launch.]</p>
        <h2>Prescription medicines</h2>
        <p>Prescription medicines are dispensed only against a valid prescription, checked by a registered pharmacist. We may refuse or change an order on professional grounds.</p>
        <h2>Prices</h2>
        <p>Prices are shown in Taka and may change. The price confirmed at checkout (or by our pharmacist for prescription orders) is the price you pay.</p>
        <h2>Pay at the shop</h2>
        <p>Items reserved for “Pay at the shop” are kept aside for 24 hours, then returned to stock.</p>
      </>
    ),
  },
};

export async function generateMetadata({ params }: PageProps<"/[locale]/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  return page ? { title: page.title, description: page.intro } : {};
}

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export default async function InfoPage({ params }: PageProps<"/[locale]/pages/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const page = PAGES[slug];
  if (!page) notFound();
  const body = await page.body();

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: page.title }]} />
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-4xl">{page.title}</h1>
        <p className="m-0 text-lg text-ink-2">{page.intro}</p>
      </div>
      <article className="prose-page max-w-3xl">{body}</article>
    </div>
  );
}
