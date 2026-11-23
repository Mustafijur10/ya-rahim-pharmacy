"use client";

import { CalendarCheck, History, LogOut, UserRound, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { RequireStaff } from "@/components/auth/Guards";
import Logo from "@/components/brand/Logo";
import { useAuth } from "@/components/providers/AuthProvider";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

/** Phone-first shell for delivery riders (installable as an app in Step 8). */
export default function RiderShell({ children }: { children: ReactNode }) {
  return (
    <RequireStaff roles={["rider"]}>
      <Shell>{children}</Shell>
    </RequireStaff>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const tab = (href: string, label: string, icon: ReactNode) => {
    const active = pathname === href;
    return (
      <Link href={href} className={`tabbar-link ${active ? "tabbar-link-active" : ""}`} aria-current={active ? "page" : undefined}>
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="rider-shell">
      <header className="rider-header">
        <div className="flex items-center justify-between gap-3">
          <Logo size="sm" markOnly onDark href="/rider" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs tracking-widest opacity-80">YA RAHIM · RIDER</span>
            <span className="truncate font-medium">{user?.name}</span>
          </div>
          <button
            type="button"
            className="btn-icon rider-header-button"
            aria-label={t("auth.signOut")}
            onClick={async () => {
              await logout();
              router.replace("/staff/login");
            }}
          >
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <nav aria-label="Rider" className="tabbar tabbar-fixed tabbar-4">
        {tab("/rider", t("rider.today"), <CalendarCheck size={22} aria-hidden="true" />)}
        {tab("/rider/history", t("rider.history"), <History size={22} aria-hidden="true" />)}
        {tab("/rider/cash", t("rider.cash"), <Wallet size={22} aria-hidden="true" />)}
        {tab("/rider/profile", t("rider.profile"), <UserRound size={22} aria-hidden="true" />)}
      </nav>
    </div>
  );
}
