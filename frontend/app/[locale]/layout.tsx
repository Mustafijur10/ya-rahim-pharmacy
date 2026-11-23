import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Hind_Siliguri, Reem_Kufi, Roboto } from "next/font/google";
import { notFound } from "next/navigation";
import Providers from "@/components/Providers";
import { themeScript } from "@/components/providers/ThemeProvider";
import { routing } from "@/i18n/routing";
import "@/styles/app.css";

// Brand guide fonts: Roboto (Latin, incl. Light for the wordmark),
// Hind Siliguri (Bangla), Reem Kufi (Arabic name in the logo).
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["300", "400", "500", "700"] });
const bengali = Hind_Siliguri({ variable: "--font-bengali", subsets: ["bengali", "latin"], weight: ["400", "500", "600"] });
const arabic = Reem_Kufi({ variable: "--font-arabic-kufi", subsets: ["arabic"], weight: ["500"] });

export const metadata: Metadata = {
  title: {
    default: "Ya Rahim Pharmacy — Genuine medicines, delivered with care",
    template: "%s · Ya Rahim Pharmacy",
  },
  description:
    "Order medicines online by brand or generic name, upload your prescription, and get same-day delivery or pick up in shop.",
  icons: { apple: "/brand/app-icon-white.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#2B1638" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${roboto.variable} ${bengali.variable} ${arabic.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved white/black theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
