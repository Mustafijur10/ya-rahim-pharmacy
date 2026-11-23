import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import AuthSplit from "@/components/auth/AuthSplit";
import VerifyForm from "@/components/auth/VerifyForm";
import { PageLoader } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Verify your number", robots: { index: false } };

export default async function Page({ params }: PageProps<"/[locale]/verify">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthSplit variant="verify">
      <Suspense fallback={<PageLoader />}>
        <VerifyForm />
      </Suspense>
    </AuthSplit>
  );
}
