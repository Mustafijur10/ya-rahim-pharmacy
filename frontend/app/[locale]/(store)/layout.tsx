import { setRequestLocale } from "next-intl/server";
import MobileTabBar from "@/components/store/MobileTabBar";
import StoreFooter from "@/components/store/StoreFooter";
import StoreHeader from "@/components/store/StoreHeader";

export default async function StoreLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="store-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <StoreHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <StoreFooter />
      <MobileTabBar />
    </div>
  );
}
