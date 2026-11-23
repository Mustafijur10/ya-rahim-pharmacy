import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import RiderShell from "@/components/rider/RiderShell";

export const metadata: Metadata = { title: "Rider", robots: { index: false, follow: false } };

export default async function RiderLayout({ children, params }: LayoutProps<"/[locale]/rider">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RiderShell>{children}</RiderShell>;
}
