"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";

type Toast = { id: number; tone: ToastTone; title: string; description?: string };

type ToastContextValue = {
  toast: (t: { title: string; description?: string; tone?: ToastTone }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, tone = "info" }) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, title, description }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
    }),
    [toast],
  );

  return (
    <ToastContext value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`toast toast-${t.tone}`}>
              <Icon size={20} aria-hidden="true" className="flex-none" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{t.title}</span>
                {t.description && <span className="text-sm opacity-90">{t.description}</span>}
              </div>
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
