"use client";

import { ExternalLink, Lock, LogOut, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { RequireStaff } from "@/components/auth/Guards";
import Logo from "@/components/brand/Logo";
import LinkPending from "@/components/common/LinkPending";
import { LanguageSwitch } from "@/components/common/Preferences";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { buttonClass } from "@/components/ui/Button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { navFor } from "@/lib/admin-nav";
import { HeaderSlot } from "./AdminHeader";
import LockScreen, { useIdleLock } from "./LockScreen";
import { useNavBadges } from "./useNavBadges";

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <RequireStaff roles={["owner", "manager", "pharmacist", "cashier", "store_keeper"]}>
      <Shell>{children}</Shell>
    </RequireStaff>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("admin");
  const { can } = useAuth();
  const { locked, lock, unlock } = useIdleLock(5 * 60_000);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  // Close the phone menu after navigating.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the drawer on route change
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button type="button" className="sidebar-scrim" aria-label={t("closeMenu")} onClick={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col" inert={locked || undefined}>
        <header className="admin-topbar">
          <button type="button" className="btn-icon btn-ghost lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t("openMenu")} aria-expanded={menuOpen}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <div ref={setHeaderSlot} className="topbar-slot" />
          <LanguageSwitch className="hidden lg:flex" />
          <button type="button" className="btn-icon btn-ghost" onClick={lock} aria-label={t("lock")} title={t("lock")}>
            <Lock size={18} aria-hidden="true" />
          </button>
          {can("pos") && !pathname.startsWith("/admin/pos") && (
            <Link href="/admin/pos" className={buttonClass("accent")}>
              <Plus size={18} aria-hidden="true" />
              <span className="hidden sm:inline">{t("newSale")}</span>
            </Link>
          )}
          <UserMenu />
        </header>
        <HeaderSlot.Provider value={headerSlot}>
          <main id="admin-main" className="admin-main">
            {children}
          </main>
        </HeaderSlot.Provider>
      </div>

      {locked && <LockScreen onUnlocked={unlock} />}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, features, feature } = useAuth();
  const t = useTranslations("admin");
  const pathname = usePathname();
  const badges = useNavBadges();
  if (!user) return null;

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Admin">
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-4">
        <Logo size="sm" onDark href="/admin" />
        <button type="button" className="btn-icon sidebar-close lg:hidden" onClick={onClose} aria-label={t("closeMenu")}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <span className="sidebar-tag">PHARMACY ADMIN</span>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {navFor(user, features).map((section) => (
          <div key={section.key} className="flex flex-col gap-0.5">
            <span className="sidebar-section">{t(`sections.${section.key}`)}</span>
            {section.items.map((item) => {
              const active = isActive(item.href);
              const count = item.badge ? badges[item.badge] : undefined;
              const Icon = item.icon;
              return (
                <Link key={item.key} href={item.href} className={`sidebar-link ${active ? "sidebar-link-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  <span className="flex-1">{t(`nav.${item.label}`)}</span>
                  {item.key === "modules" ? <span className="sidebar-chip">Super admin</span> : !!count && <span className="sidebar-badge">{count}</span>}
                  <LinkPending />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {feature("dark_theme") && <SidebarTheme />}
      <div className="sidebar-user">
        <span className="avatar">{user.initials}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-white">{user.name}</span>
          <span className="truncate text-xs">
            {user.role === "owner" ? "Super admin · Owner" : user.role_label}
            {user.staff_note ? ` · ${user.staff_note}` : ""}
          </span>
        </span>
      </div>
    </aside>
  );
}

/** "Theme ☀ ☾" switch at the bottom of the sidebar (design). */
function SidebarTheme() {
  const { resolved, setTheme } = useTheme();
  const t = useTranslations("common.theme");
  return (
    <div className="sidebar-theme">
      <span>{t("label")}</span>
      <div role="group" aria-label={t("label")} className="sidebar-theme-group">
        <button type="button" className={`sidebar-theme-option ${resolved === "light" ? "sidebar-theme-option-active" : ""}`} aria-pressed={resolved === "light"} aria-label={t("light")} onClick={() => setTheme("light")}>
          <Sun size={18} aria-hidden="true" />
        </button>
        <button type="button" className={`sidebar-theme-option ${resolved === "dark" ? "sidebar-theme-option-active" : ""}`} aria-pressed={resolved === "dark"} aria-label={t("dark")} onClick={() => setTheme("dark")}>
          <Moon size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const t = useTranslations();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="relative">
      <button type="button" className="user-menu-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar">{user.initials}</span>
        <span className="hidden flex-col text-left md:flex">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs text-muted">{user.role === "owner" ? "Super admin" : user.role_label}</span>
        </span>
      </button>
      {open && (
        <>
          <button type="button" className="menu-scrim" aria-label={t("common.close")} onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <Link href="/" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <ExternalLink size={16} aria-hidden="true" />
              {t("admin.viewStore")}
            </Link>
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await logout();
                router.replace("/staff/login");
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              {t("auth.signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
