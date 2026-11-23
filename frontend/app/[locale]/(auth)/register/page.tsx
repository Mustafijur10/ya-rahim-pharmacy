import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import AuthSplit from "@/components/auth/AuthSplit";
import RegisterForm from "@/components/auth/RegisterForm";
import { PageLoader } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function Page({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthSplit variant="register">
      <Suspense fallback={<PageLoader />}>
        <RegisterForm />
      </Suspense>
    </AuthSplit>
  );
}
