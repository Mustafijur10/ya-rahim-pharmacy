"use client";

import { FileUp, Home, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import LinkPending from "@/components/common/LinkPending";
import { Link, usePathname } from "@/i18n/navigation";

/** Phone-width bottom tabs from the mobile design (hidden on wider screens). */
export default function MobileTabBar() {
  // The active tab depends on the URL (request-time data), so it sits in its own boundary.
  return (
    <Suspense fallback={<TabBar pathname={null} />}>
      <TabBarWithPath />
    </Suspense>
  );
}

function TabBarWithPath() {
  return <TabBar pathname={usePathname()} />;
}

function TabBar({ pathname }: { pathname: string | null }) {
  const t = useTranslations("store.tabs");
  const { count } = useCart();
  const { user } = useAuth();

  const tab = (href: string, label: string, icon: React.ReactNode, match = href) => {
    const active = pathname !== null && (match === "/" ? pathname === "/" : pathname.startsWith(match));
    return (
      <Link href={href} className={`tabbar-link ${active ? "tabbar-link-active" : ""}`} aria-current={active ? "page" : undefined}>
        {icon}
        {label}
        <LinkPending className="link-pending-corner" />
      </Link>
    );
  };

  return (
    <nav aria-label="Main" className="tabbar tabbar-fixed md:hidden">
      {tab("/", t("home"), <Home size={22} aria-hidden="true" />)}
      {tab("/categories", t("categories"), <LayoutGrid size={22} aria-hidden="true" />)}
      <Link href="/upload-prescription" className="tabbar-link tabbar-link-raised">
        <span className="tabbar-raised-icon">
          <FileUp size={22} aria-hidden="true" />
        </span>
        {t("uploadRx")}
      </Link>
      {tab("/cart", `${t("cart")}${count ? ` (${count})` : ""}`, <ShoppingCart size={22} aria-hidden="true" />)}
      {tab(user && !user.is_staff ? "/account" : "/login", t("account"), <UserRound size={22} aria-hidden="true" />, "/account")}
    </nav>
  );
}
