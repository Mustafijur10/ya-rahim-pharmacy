import { getLocale, getTranslations } from "next-intl/server";
import Logo from "@/components/brand/Logo";
import LinkPending from "@/components/common/LinkPending";
import { LanguageSwitch } from "@/components/common/Preferences";
import { Link } from "@/i18n/navigation";
import { filled, getCategories, getStoreInfo } from "@/lib/store-data";
import HeaderActions from "./HeaderActions";
import SearchBox from "./SearchBox";

export default async function StoreHeader() {
  const [t, locale, store, categories] = await Promise.all([getTranslations("store"), getLocale(), getStoreInfo(), getCategories()]);
  const phone = filled(store.phone);

  return (
    <>
      <div className="utility-bar">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <span>{t("utility", { area: locale === "bn" ? "আপনার" : "your" })}</span>
          <div className="flex items-center gap-4">
            {phone && <a href={`tel:${phone}`} className="utility-link">{t("callToOrder", { phone })}</a>}
            <Link href="/contact" className="utility-link">
              {t("contactUs")}
            </Link>
            <LanguageSwitch />
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
          <Logo size="md" />
          <div className="order-3 w-full md:order-none md:w-auto md:flex-1">
            <SearchBox />
          </div>
          <div className="ml-auto md:ml-0">
            <HeaderActions />
          </div>
        </div>
        <nav aria-label="Categories" className="cat-nav">
          <div className="container-page flex gap-1 overflow-x-auto">
            <Link href="/medicines" className="cat-nav-link">
              {t("allMedicines")}
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={`/category/${c.slug}`} className="cat-nav-link">
                {locale === "bn" && c.name_bn ? c.name_bn : c.name}
                <LinkPending />
              </Link>
            ))}
            <Link href="/offers" className="cat-nav-link cat-nav-link-accent">
              {t("offers")}
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
