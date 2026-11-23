"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import PinPad from "@/components/auth/PinPad";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";
import { ApiError, apiSend } from "@/lib/api";
import type { Features, User } from "@/lib/types";

const LOCK_KEY = "yr-locked";

/**
 * "Auto-lock after 5 minutes idle" (security rule in the design). Any key, click or touch
 * resets the timer. The lock survives a page reload (sessionStorage) so it can't be skipped.
 */
export function useIdleLock(timeoutMs: number) {
  const [locked, setLocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    sessionStorage.setItem(LOCK_KEY, "1");
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    sessionStorage.removeItem(LOCK_KEY);
    setLocked(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a lock that was active before reload
    if (sessionStorage.getItem(LOCK_KEY)) setLocked(true);

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, timeoutMs);
    };
    const events = ["mousemove", "keydown", "pointerdown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lock, timeoutMs]);

  return { locked, lock, unlock };
}

export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { user, setUser, logout } = useAuth();
  const t = useTranslations("admin");
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Log in as soon as the 4th digit is entered.
  function onPinChange(v: string) {
    setPin(v);
    if (v.length === 4) submit(v);
  }

  async function submit(value = pin) {
    if (!user || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ user: User; features: Features }>("post", "/auth/staff/login", { user_id: user.id, pin: value });
      setUser(res.user, res.features);
      onUnlocked();
    } catch (e) {
      setError((e as ApiError).field("login") ?? (e as ApiError).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <div className="lock-card">
        <span className="avatar avatar-lg">{user?.initials}</span>
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 id="lock-title" className="m-0 flex items-center gap-2 text-xl">
            <Lock size={18} aria-hidden="true" />
            {t("locked")}
          </h2>
          <span className="text-sm text-muted">
            {user?.name} · {t("lockedHelp")}
          </span>
        </div>
        <PinPad value={pin} onChange={onPinChange} onSubmit={() => submit()} disabled={busy} />
        {error && (
          <p className="field-error m-0" role="alert">
            {error}
          </p>
        )}
        <Button variant="accent" size="lg" block loading={busy} onClick={() => submit()} disabled={pin.length < 4} className="rounded-full">
          {t("unlock")}
        </Button>
        <button
          type="button"
          className="link-button text-sm"
          onClick={async () => {
            sessionStorage.removeItem(LOCK_KEY);
            await logout();
            router.replace("/staff/login");
          }}
        >
          {t("switchUser")}
        </button>
      </div>
    </div>
  );
}
