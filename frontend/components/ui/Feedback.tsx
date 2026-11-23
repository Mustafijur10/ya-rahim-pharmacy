import { AlertTriangle, Inbox, Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ label = "Loading…", size = 20 }: { label?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <Loader2 size={size} className="spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </span>
  );
}

/** Centered loading state for a whole page or panel. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} size={24} />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon ?? <Inbox size={28} />}
      </span>
      <h2 className="m-0 text-lg">{title}</h2>
      {description && <p className="m-0 max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state-icon empty-state-icon-error" aria-hidden="true">
        <AlertTriangle size={28} />
      </span>
      <p className="m-0 max-w-md">{message}</p>
      {onRetry && (
        <button type="button" className="btn-outline" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function NoAccess({ message }: { message: string }) {
  return <EmptyState icon={<Lock size={28} />} title={message} />;
}

export function Notice({ tone = "warn", title, children, icon }: { tone?: "warn" | "brand" | "rx"; title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`}>
      {icon && (
        <span className="flex-none" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        {title && <span className="font-bold">{title}</span>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
