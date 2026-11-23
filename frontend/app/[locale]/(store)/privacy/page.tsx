import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import { buttonClass } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { filled, getStoreInfo } from "@/lib/store-data";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What information Ya Rahim Pharmacy collects, how we use it, and the choices you have.",
};

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const store = await getStoreInfo();
  const contact = [filled(store.email) ?? "[email address]", filled(store.phone) ?? "01XXX-XXXXXX"].join(" or ");

  const sections: { id: string; title: string; body: React.ReactNode }[] = [
    { id: "collect", title: "Information we collect", body: <p>When you order, create an account or contact us, we collect your name, mobile number, delivery address, email (optional) and order history. When you use the website we also collect basic technical information such as device type and pages visited.</p> },
    {
      id: "health",
      title: "Prescriptions & health information",
      body: (
        <>
          <p>Prescription photos and the medicines you buy are sensitive health information. They are seen only by our pharmacists and the staff who pack your order, and are used only to dispense and check your medicines safely.</p>
          <p className="font-medium">We never sell or use this information for advertising.</p>
        </>
      ),
    },
    {
      id: "use",
      title: "How we use your information",
      body: (
        <ul>
          <li>To process, deliver and support your orders</li>
          <li>To verify prescriptions and keep dispensing records required by law</li>
          <li>To send order updates and, if you choose, refill reminders by SMS</li>
          <li>To prevent fraud and keep the service secure</li>
        </ul>
      ),
    },
    { id: "share", title: "Who we share it with", body: <p>Only with the people needed to serve you: our delivery riders or courier partner (name, phone, address), payment providers such as bKash, Nagad and card processors, and government authorities when the law requires it.</p> },
    { id: "payments", title: "Payments", body: <p>Mobile and card payments are processed by the payment provider. We do not store your PIN, OTP or full card number.</p> },
    { id: "keep", title: "How long we keep it", body: <p>Order and dispensing records are kept for [period] as required for pharmacy records. You can ask us to delete your account; we will remove what we are not required to keep.</p> },
    {
      id: "rights",
      title: "Your choices & rights",
      body: (
        <ul>
          <li>See and correct your personal details in your account</li>
          <li>Turn SMS reminders and offers on or off at any time</li>
          <li>Ask for a copy of your data or for your account to be deleted</li>
        </ul>
      ),
    },
    { id: "cookies", title: "Cookies", body: <p>We use essential cookies to keep you signed in and remember your cart, and simple analytics to improve the site. You can block cookies in your browser; some features may stop working.</p> },
    { id: "security", title: "Security", body: <p>Access to customer and prescription data is limited by staff role, protected by personal logins and logged. No system is perfect; we will inform you if a breach affects your data.</p> },
    { id: "changes", title: "Changes to this policy", body: <p>We may update this policy. The date at the top shows the latest version; significant changes will be announced on the website.</p> },
    { id: "contact", title: "Contact us", body: <p>For privacy questions, contact us at {contact}, or visit the shop.</p> },
  ];

  return (
    <div className="container-page flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: "Privacy policy" }]} />
        <h1 className="m-0 text-4xl">Privacy policy</h1>
        <span className="text-sm text-muted">Last updated: [date]</span>
        <p className="m-0 max-w-3xl text-lg text-ink-2">This policy explains what information Ya Rahim Pharmacy collects when you shop with us online or at the shop, how we use it, and the choices you have.</p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[260px_1fr]">
        <nav aria-label="On this page" className="toc">
          <span className="eyebrow">On this page</span>
          <ol className="m-0 flex flex-col gap-1 pl-5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="prose-page">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2>
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
          <div className="notice-brand mt-6 items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-bold">Questions?</span>
              <span className="text-sm text-ink-2">Contact us — we’re happy to explain how your information is handled.</span>
            </div>
            <Link href="/contact" className={buttonClass("primary")}>
              Contact us
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
