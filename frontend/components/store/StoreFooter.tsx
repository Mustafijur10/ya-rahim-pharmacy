import { getTranslations } from "next-intl/server";
import Logo from "@/components/brand/Logo";
import { Link } from "@/i18n/navigation";
import { filled, getStoreInfo } from "@/lib/store-data";

export default async function StoreFooter() {
  const [t, ts, store] = await Promise.all([getTranslations("store.footer"), getTranslations("store"), getStoreInfo()]);
  const drug = filled(store.drug_licence_no);
  const trade = filled(store.trade_licence_no);

  return (
    <footer className="site-footer">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <Logo size="md" onDark href="/" />
          <div className="flex flex-col gap-1 text-sm">
            {drug && <span>{t("drugLicence", { no: drug })}</span>}
            {trade && <span>{t("tradeLicence", { no: trade })}</span>}
            {filled(store.address) && <span>{store.address}</span>}
          </div>
        </div>
        <nav aria-label={t("company")} className="flex flex-col gap-2">
          <h2 className="footer-heading">{t("company")}</h2>
          <Link href="/about" className="footer-link">{t("about")}</Link>
          <Link href="/contact" className="footer-link">{ts("contactUs")}</Link>
          <Link href="/#visit" className="footer-link">{ts("visitShop")}</Link>
        </nav>
        <nav aria-label={t("shop")} className="flex flex-col gap-2">
          <h2 className="footer-heading">{t("shop")}</h2>
          <Link href="/medicines" className="footer-link">{ts("allMedicines")}</Link>
          <Link href="/category/healthcare" className="footer-link">Healthcare</Link>
          <Link href="/offers" className="footer-link">{ts("offers")}</Link>
        </nav>
        <nav aria-label={t("help")} className="flex flex-col gap-2">
          <h2 className="footer-heading">{t("help")}</h2>
          <Link href="/pages/how-to-order" className="footer-link">{t("howToOrder")}</Link>
          <Link href="/pages/delivery" className="footer-link">{t("deliveryAreas")}</Link>
          <Link href="/pages/returns" className="footer-link">{t("returns")}</Link>
          <Link href="/privacy" className="footer-link">{t("privacy")}</Link>
        </nav>
        <div className="flex flex-col gap-3">
          <h2 className="footer-heading">{t("weAccept")}</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {[t("cod"), "bKash", "Nagad", "Visa / Mastercard"].map((m) => (
              <li key={m} className="pay-chip">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container-page py-4">
          <p className="m-0 text-sm">{t("disclaimer")}</p>
        </div>
      </div>
    </footer>
  );
}
