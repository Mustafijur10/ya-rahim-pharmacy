"use client";

import { FileUp, ShoppingCart, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/common/Preferences";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCart } from "@/components/providers/CartProvider";
import { Link } from "@/i18n/navigation";
import { homeFor } from "@/lib/permissions";

export default function HeaderActions() {
  const t = useTranslations("store");
  const { user } = useAuth();
  const { count } = useCart();

  return (
    <div className="flex items-center gap-2">
      <Link href="/upload-prescription" className="btn-accent hidden md:inline-flex">
        <FileUp size={18} aria-hidden="true" />
        {t("uploadRx")}
      </Link>
      <ThemeToggle />
      <Link href={user ? homeFor(user) : "/login"} className="btn-icon btn-ghost" aria-label={user ? `${t("account")}: ${user.name}` : t("signIn")}>
        <UserRound size={20} aria-hidden="true" />
      </Link>
      <Link href="/cart" className="btn-ghost" aria-label={`${t("cart")} (${count})`}>
        <ShoppingCart size={20} aria-hidden="true" />
        <span className="hidden sm:inline">{t("cart")}</span>
        <span className="badge-count" aria-hidden="true">
          {count}
        </span>
      </Link>
    </div>
  );
}
