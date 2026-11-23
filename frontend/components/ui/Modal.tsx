"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

/** Native <dialog>: focus trap, Esc to close and a backdrop for free. */
export default function Modal({ open, onClose, title, description, children, footer, size = "md" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="m-0 text-xl">
                {title}
              </h2>
              {description && (
                <p id={descId} className="m-0 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="btn-icon btn-ghost" onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {children}
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
