import { Mail, MapPin, MessageCircle, Phone, Siren } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import ContactForm from "@/components/store/ContactForm";
import { Link } from "@/i18n/navigation";
import { filled, getStoreInfo, orPlaceholder } from "@/lib/store-data";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions about a medicine, an order or a prescription? Call, message or visit Ya Rahim Pharmacy.",
};

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const store = await getStoreInfo();
  const phone = filled(store.phone);
  const whatsapp = filled(store.whatsapp);
  const email = filled(store.email);

  const ways = [
    { icon: Phone, title: "Call us", value: phone ?? "01XXX-XXXXXX", note: "Orders & pharmacist advice", href: phone ? `tel:${phone}` : undefined },
    { icon: MessageCircle, title: "WhatsApp", value: whatsapp ?? "01XXX-XXXXXX", note: "Send a prescription photo", href: whatsapp ? `https://wa.me/88${whatsapp.replace(/\D/g, "")}` : undefined },
    { icon: Mail, title: "Email", value: email ?? "[email address]", note: "Reply within 1 working day", href: email ? `mailto:${email}` : undefined },
    { icon: MapPin, title: "Visit the shop", value: orPlaceholder(store.area, "[Area, City]"), note: orPlaceholder(store.opening_hours, "Open [hours], 7 days"), href: filled(store.map_url) ?? undefined },
  ];
  const faq = [
    ["Do I need a prescription to order?", "Only for prescription (Rx) medicines. Over-the-counter items can be ordered directly."],
    ["How fast is delivery?", "Express delivery within about 2 hours in our express areas; standard delivery the same day. Pickup orders are ready in 30 minutes."],
    ["Can I return a medicine?", "Unopened items with the receipt can be returned within [days] days, except fridge items and opened strips. See our return policy."],
  ];

  return (
    <div className="container-page flex flex-col gap-10 py-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: "Contact us" }]} />
        <h1 className="m-0 text-4xl">Contact us</h1>
        <p className="m-0 max-w-2xl text-lg text-ink-2">Questions about a medicine, an order or a prescription? Call, message or visit — a pharmacist is available during shop hours.</p>
      </div>

      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {ways.map(({ icon: Icon, title, value, note, href }) => (
          <li key={title} className="card-pad flex flex-col gap-2">
            <span className="trust-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <span className="font-bold">{title}</span>
            {href ? (
              <a href={href} className="font-medium" {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {value}
              </a>
            ) : (
              <span className="font-medium">{value}</span>
            )}
            <span className="text-sm text-muted">{note}</span>
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section className="card-pad flex flex-col gap-5">
          <h2 className="section-title">Send us a message</h2>
          <ContactForm />
        </section>

        <div className="flex flex-col gap-4">
          <div className="map-placeholder map-placeholder-card">
            <MapPin size={36} aria-hidden="true" />
            Map — shop location
          </div>
          <section className="card-pad flex flex-col gap-3">
            <h2 className="m-0 text-lg">Opening hours</h2>
            <dl className="summary-list">
              <dt>Saturday – Thursday</dt>
              <dd>{orPlaceholder(store.hours_sat_thu, "[open] – [close]")}</dd>
              <dt>Friday</dt>
              <dd>{orPlaceholder(store.hours_friday, "[open] – [close]")}</dd>
              <dt>Online orders</dt>
              <dd>24 hours</dd>
              <dt>Delivery</dt>
              <dd>{orPlaceholder(store.delivery_hours, "[start] – [end]")}</dd>
            </dl>
          </section>
          <div className="notice-rx">
            <Siren size={22} aria-hidden="true" className="flex-none" />
            <div className="flex flex-col gap-1">
              <span className="font-bold">Emergency?</span>
              <span>For a medical emergency call 999 or go to the nearest hospital. Do not wait for a reply to this form.</span>
            </div>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="section-title">Common questions</h2>
        <div className="flex flex-col gap-3">
          {faq.map(([q, a]) => (
            <details key={q} className="faq">
              <summary className="faq-q">{q}</summary>
              <p className="m-0 px-5 pb-5 text-ink-2">
                {a} {q.startsWith("Can I return") && <Link href="/pages/returns">Read the return policy.</Link>}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
