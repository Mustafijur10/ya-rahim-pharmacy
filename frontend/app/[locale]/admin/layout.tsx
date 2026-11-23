import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Ya Rahim Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminShell>{children}</AdminShell>;
}
