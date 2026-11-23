import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import AuthSplit from "@/components/auth/AuthSplit";
import LoginForm from "@/components/auth/LoginForm";
import { PageLoader } from "@/components/ui/Feedback";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function Page({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthSplit variant="login">
      <Suspense fallback={<PageLoader />}>
        <LoginForm />
      </Suspense>
    </AuthSplit>
  );
}
