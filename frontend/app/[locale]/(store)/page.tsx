import { BadgeCheck, CalendarClock, CreditCard, FileUp, MapPin, Phone, Search, ShieldCheck, Truck, UserRoundCheck } from "lucide-react";
import { getLocale, setRequestLocale } from "next-intl/server";
import CategoryIcon from "@/components/store/CategoryIcon";
import MostOrdered from "@/components/store/MostOrdered";
import RxUploadForm from "@/components/store/RxUploadForm";
import { buttonClass } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { filled, getHome, getStoreInfo, orPlaceholder } from "@/lib/store-data";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [home, store, lang] = await Promise.all([getHome(), getStoreInfo(), getLocale()]);
  const licence = filled(store.drug_licence_no);
  const area = filled(store.area);

  const trust = [
    { icon: ShieldCheck, title: "100% genuine medicines", text: "Sourced directly from company distributors" },
    { icon: UserRoundCheck, title: "Pharmacist-verified orders", text: "Every Rx order checked before dispatch" },
    { icon: Truck, title: "Fast local delivery", text: `Same day${area ? ` in ${area}` : ""} · Pickup ready in 30 min` },
    { icon: CreditCard, title: "Pay your way", text: "Cash on delivery, bKash, Nagad or card" },
  ];

  return (
    <>
      {/* Hero + prescription card */}
      <section className="hero">
        <div className="container-page grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col gap-6">
            <span className="hero-eyebrow">Order online · Pick up in shop · Home delivery</span>
            <h1 className="hero-title">
              Genuine medicines,
              <br />
              <span className="text-accent dark:text-accent-soft">delivered with care.</span>
            </h1>
            <p className="m-0 max-w-xl text-lg text-ink-2">
              Search by brand or generic name, upload your prescription, and our pharmacist confirms your order by phone before it leaves Ya Rahim Pharmacy.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/upload-prescription" className={buttonClass("accent", "lg")}>
                <FileUp size={20} aria-hidden="true" />
                Order with prescription
              </Link>
              <Link href="/medicines" className={buttonClass("outline", "lg")}>
                <Search size={20} aria-hidden="true" />
                Browse medicines
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
              <span className="inline-flex items-center gap-2">
                <BadgeCheck size={18} aria-hidden="true" className="text-brand dark:text-brand-line" />
                Drug Licence No. {licence ?? "[number]"}
              </span>
              <span className="inline-flex items-center gap-2">
                <UserRoundCheck size={18} aria-hidden="true" className="text-brand dark:text-brand-line" />
                Registered pharmacist on duty
              </span>
            </div>
          </div>

          <div className="card-pad flex flex-col gap-5 shadow-sm" id="rx">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-xl">Order with your prescription</h2>
              <span className="badge-save">Takes 1 minute</span>
            </div>
            <RxUploadForm compact />
            <ol className="steps">
              <li>Upload the prescription</li>
              <li>Pharmacist calls to confirm items &amp; price</li>
              <li>Delivered, or ready for pickup</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Why Ya Rahim" className="border-y border-solid border-line bg-card">
        <div className="container-page">
        <ul className="m-0 grid list-none gap-6 p-0 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="trust-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        </div>
      </section>

      {/* Categories */}
      <section className="container-page flex flex-col gap-5 py-12">
        <div className="section-head">
          <h2 className="section-title">Shop by category</h2>
          <Link href="/categories" className="font-medium">
            View all categories
          </Link>
        </div>
        <div className="cat-grid">
          {home.categories.map((c, i) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="cat-tile">
              <CategoryIcon icon={c.icon} index={i} />
              <span className="font-medium">{lang === "bn" && c.name_bn ? c.name_bn : c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Most ordered */}
      <section className="container-page flex flex-col gap-5 pb-12">
        <div className="section-head">
          <div className="flex flex-col gap-1">
            <h2 className="section-title">Most ordered medicines</h2>
            <p className="m-0 text-sm text-muted">Prices shown below MRP. Rx items need a valid prescription.</p>
          </div>
          <Link href="/medicines" className="font-medium">
            See all
          </Link>
        </div>
        <MostOrdered initial={home.most_ordered} filters={home.quick_filters} />
      </section>

      {/* Monthly refill */}
      <section className="container-page pb-12">
        <div className="refill-banner">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-accent-pale">
              <CalendarClock size={18} aria-hidden="true" />
              For regular medicines
            </span>
            <h2 className="m-0 text-3xl text-white">Never run out of your monthly medicines</h2>
            <p className="m-0 text-[#D9CCE3]">
              Save your prescription once. We remind you by SMS before it runs out and prepare the refill — delivered or ready at the counter.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/account?tab=refills" className={buttonClass("accent", "lg")}>
              Set up monthly refill
            </Link>
            <Link href="/pages/how-to-order" className="btn-on-dark">
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Companies */}
      {home.companies.length > 0 && (
        <section className="container-page flex flex-col gap-5 pb-12">
          <h2 className="section-title">Shop by pharmaceutical company</h2>
          <div className="flex flex-wrap gap-3">
            {home.companies.map((co) => (
              <Link key={co.id} href={{ pathname: "/medicines", query: { brands: co.slug } }} className="company-chip">
                {co.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Visit our shop */}
      <section id="visit" className="container-page pb-4">
        <div className="card grid overflow-hidden md:grid-cols-2">
          <div className="flex flex-col gap-4 p-8">
            <h2 className="section-title">Visit our shop</h2>
            <p className="m-0 text-ink-2">
              Order online and collect from the counter — no waiting. Your online and in-shop purchases share one account and one purchase history.
            </p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-ink-2">
              <li className="flex items-start gap-3">
                <MapPin size={20} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
                {orPlaceholder(store.address, "[Shop address, area, city]")}
              </li>
              <li className="flex items-start gap-3">
                <CalendarClock size={20} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
                {orPlaceholder(store.opening_hours, "Open [hours], 7 days")}
              </li>
              <li className="flex items-start gap-3">
                <Phone size={20} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
                {filled(store.phone) ? <a href={`tel:${store.phone}`}>{store.phone}</a> : "01XXX-XXXXXX"}
              </li>
            </ul>
            <div className="flex flex-wrap gap-3">
              {filled(store.map_url) && (
                <a href={store.map_url!} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Get directions
                </a>
              )}
              <Link href="/contact" className="btn-outline">
                Contact us
              </Link>
            </div>
          </div>
          <div className="map-placeholder">
            <MapPin size={40} aria-hidden="true" />
            <span>Map — shop location</span>
          </div>
        </div>
      </section>
    </>
  );
}
