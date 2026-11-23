"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/components/providers/AuthProvider";
import { Link, useRouter } from "@/i18n/navigation";
import { apiSend, ApiError } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/permissions";
import type { Features, User } from "@/lib/types";

/** Staff sign-in: phone/email + password, or phone + counter PIN. */
export default function StaffLoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { setUser } = useAuth();

  const [mode, setMode] = useState<"password" | "pin">("password");
  const [login, setLogin] = useState("");
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: User; features: Features }>("post", "/auth/staff/login", {
        login,
        remember,
        ...(mode === "password" ? { password: secret } : { pin: secret }),
      });
      setUser(res.user, res.features);
      const home = homeFor(res.user);
      // Never send a cashier to an owner-only "next" page: only follow it inside their area.
      const target = safeNext(next, home);
      router.replace(target.startsWith("/admin") || target.startsWith("/rider") ? target : home);
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && !error.field("login") && <Notice tone="rx">{error.message}</Notice>}

      <TextField label={t("login")} autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} error={error?.field("login")} />
      {mode === "password" ? (
        <TextField key="password" label={t("password")} type="password" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
      ) : (
        <TextField key="pin" label={t("pin")} type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} required value={secret} onChange={(e) => setSecret(e.target.value.replace(/\D/g, ""))} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox label={t("remember")} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <button
          type="button"
          className="link-button text-sm"
          onClick={() => {
            setMode(mode === "password" ? "pin" : "password");
            setSecret("");
          }}
        >
          {mode === "password" ? t("usePin") : t("usePassword")}
        </button>
      </div>

      <Button type="submit" size="lg" loading={busy} block>
        {t("signIn")}
      </Button>

      <Link href="/login" className="text-center text-sm">
        {t("customerLink")}
      </Link>
    </form>
  );
}
