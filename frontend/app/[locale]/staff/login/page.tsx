import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import StaffPinLogin from "@/components/auth/StaffPinLogin";
import Logo from "@/components/brand/Logo";
import { LanguageSwitch, ThemeToggle } from "@/components/common/Preferences";
import { PageLoader } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Staff login", robots: { index: false } };

export default async function StaffLoginPage({ params }: PageProps<"/[locale]/staff/login">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="staff-login-shell">
      <header className="staff-login-header">
        <Logo size="md" onDark />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle className="text-white" />
        </div>
      </header>
      <Suspense fallback={<PageLoader />}>
        <StaffPinLogin />
      </Suspense>
    </div>
  );
}
