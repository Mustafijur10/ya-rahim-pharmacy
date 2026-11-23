import { setRequestLocale } from "next-intl/server";

/** Customer sign-in pages use their own two-panel layout (no store header/footer). */
export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <>{children}</>;
}
