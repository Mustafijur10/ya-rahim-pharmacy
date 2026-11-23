import { HandHeart, Image as ImageIcon, MessageCircleQuestion, PackageCheck, ShieldCheck, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import { buttonClass } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { getStoreInfo, orPlaceholder } from "@/lib/store-data";

export const metadata: Metadata = {
  title: "About us",
  description: "Ya Rahim Pharmacy — your neighbourhood pharmacy, built on trust. Genuine medicines and pharmacist-checked prescriptions.",
};

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const store = await getStoreInfo();
  const area = orPlaceholder(store.area, "[your area]");
  const since = orPlaceholder(store.since_year, "[year]");

  const promise = [
    { icon: ShieldCheck, title: "Genuine medicines only", text: "Bought from company distributors with invoices. No grey-market or unknown sources, ever." },
    { icon: PackageCheck, title: "Pharmacist-checked", text: "Every prescription order is verified by a registered pharmacist before it is packed." },
    { icon: Snowflake, title: "Right storage", text: "Temperature-sensitive medicines are kept in a monitored fridge and delivered quickly." },
    { icon: MessageCircleQuestion, title: "Honest advice", text: "We suggest only what you need, and explain how to take it. Ask us anything." },
  ];
  const team = [
    { initials: "TA", name: "Tanvir Ahmed", role: "Owner", note: "Manages the pharmacy and online store" },
    { initials: "FR", name: "Farhan Rahman", role: "Pharmacist", note: "Reg. no. [number]" },
    { initials: "MK", name: "Mahmuda Khatun", role: "Pharmacist", note: "Reg. no. [number]" },
    { initials: "NS", name: "Nusrat Sultana", role: "Shop manager", note: "Orders, stock & customer care" },
  ];

  return (
    <div className="flex flex-col gap-16 pb-8">
      <section className="hero">
        <div className="container-page grid items-center gap-10 py-12 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Breadcrumbs items={[{ label: "About us" }]} />
            <h1 className="hero-title">Your neighbourhood pharmacy, built on trust.</h1>
            <p className="m-0 text-lg text-ink-2">
              Ya Rahim Pharmacy has served {area} since {since}. Every medicine comes from authorised distributors, and every prescription is checked by a registered pharmacist — whether you visit the counter or order online.
            </p>
          </div>
          <div className="photo-placeholder">
            <ImageIcon size={40} aria-hidden="true" />
            Photo — shop front &amp; counter
          </div>
        </div>
      </section>

      <section className="container-page">
        <dl className="stat-grid">
          {[
            [store.since_year ? `Since ${store.since_year}` : "[years]", "Serving the community"],
            ["[number]", "Medicines & products in stock"],
            ["[number]", "Families served"],
            ["7 days", "Open every day"],
          ].map(([value, label]) => (
            <div key={label} className="stat">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="m-0 text-3xl font-bold text-brand dark:text-brand-line">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="container-page grid items-center gap-10 lg:grid-cols-2">
        <div className="photo-placeholder">
          <ImageIcon size={40} aria-hidden="true" />
          Photo — pharmacist with a customer
        </div>
        <div className="flex flex-col gap-4">
          <span className="eyebrow">Our story</span>
          <h2 className="section-title">Started as one counter. Still run with the same care.</h2>
          <p className="m-0 text-ink-2">[Write your story here: how and why the pharmacy started, who founded it, and what changed over the years.]</p>
          <p className="m-0 text-ink-2">Today the same team serves you at the shop and online — one stock, one price list, one purchase history for every customer.</p>
        </div>
      </section>

      <section className="container-page flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">What we stand for</span>
          <h2 className="section-title">Our promise to every customer</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {promise.map(({ icon: Icon, title, text }) => (
            <article key={title} className="card-pad flex flex-col gap-3">
              <span className="trust-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3 className="m-0 text-lg">{title}</h3>
              <p className="m-0 text-sm text-ink-2">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-page flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Our team</span>
          <h2 className="section-title">The people behind the counter</h2>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((p) => (
            <li key={p.name} className="card-pad flex flex-col items-center gap-2 text-center">
              <span className="avatar avatar-xl">{p.initials}</span>
              <span className="font-bold">{p.name}</span>
              <span className="text-sm font-medium text-accent dark:text-accent-soft">{p.role}</span>
              <span className="text-sm text-muted">{p.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page">
        <div className="card-pad flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="section-title">Licensed &amp; registered</h2>
            <p className="m-0 text-ink-2">Our licences are displayed at the shop and available on request.</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              ["Drug Licence", orPlaceholder(store.drug_licence_no, "[number]")],
              ["Trade Licence", orPlaceholder(store.trade_licence_no, "[number]")],
              ["TIN / BIN", orPlaceholder(store.tin_bin, "[number]")],
            ].map(([label, value]) => (
              <div key={label} className="tile flex flex-col gap-1">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="m-0 font-mono font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-page">
        <div className="refill-banner">
          <div className="flex flex-col gap-2">
            <h2 className="m-0 flex items-center gap-2 text-2xl text-white">
              <HandHeart size={26} aria-hidden="true" />
              Come and say hello
            </h2>
            <p className="m-0 text-[#D9CCE3]">
              {orPlaceholder(store.address, "[Shop address]")} · {orPlaceholder(store.opening_hours, "Open [hours], 7 days")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className={buttonClass("accent", "lg")}>
              Contact us
            </Link>
            <Link href="/medicines" className="btn-on-dark">
              Shop online
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
