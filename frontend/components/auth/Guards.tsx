"use client";

import { useTranslations } from "next-intl";
import { Suspense, useEffect, type ReactNode } from "react";
import { NoAccess, PageLoader } from "@/components/ui/Feedback";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePathname, useRouter } from "@/i18n/navigation";
import { homeFor } from "@/lib/permissions";
import type { Module, PermissionLevel, Role } from "@/lib/types";

/*
 * Client-side gates for signed-in areas. They decide what to SHOW; the Laravel API
 * still checks every request, so hiding a screen is never the only protection.
 *
 * Each gate reads the current URL (to send people back after sign-in). That is
 * request-time data, so the gates render inside their own Suspense boundary.
 */

export function RequireStaff({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <StaffGate roles={roles}>{children}</StaffGate>
    </Suspense>
  );
}

function StaffGate({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace({ pathname: "/staff/login", query: { next: pathname } });
    else if (!user.is_staff) router.replace("/account");
    else if (roles && user.role && !roles.includes(user.role)) router.replace(homeFor(user));
  }, [user, isLoading, router, pathname, roles]);

  if (isLoading || !user || !user.is_staff) return <PageLoader label={t("loading")} />;
  if (roles && user.role && !roles.includes(user.role)) return <PageLoader label={t("loading")} />;
  return <>{children}</>;
}

/** Wrap a staff page: shows "no access" unless the user has one of the levels. */
export function RequireModule({ module, levels = ["full"], children }: { module: Module; levels?: PermissionLevel[]; children: ReactNode }) {
  const { can } = useAuth();
  const t = useTranslations("common");
  if (!can(module, ...levels)) return <NoAccess message={t("noAccess")} />;
  return <>{children}</>;
}

export function RequireCustomer({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <CustomerGate>{children}</CustomerGate>
    </Suspense>
  );
}

function CustomerGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace({ pathname: "/login", query: { next: pathname } });
    else if (user.is_staff) router.replace(homeFor(user));
  }, [user, isLoading, router, pathname]);

  if (isLoading || !user || user.is_staff) return <PageLoader label={t("loading")} />;
  return <>{children}</>;
}
