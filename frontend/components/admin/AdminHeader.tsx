"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The spot in the admin top bar where each page puts its title, subtitle and actions. */
export const HeaderSlot = createContext<HTMLElement | null>(null);

/** Admin page title. Rendered inside the top bar so the page itself starts with its content. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  const slot = useContext(HeaderSlot);
  const content = (
    <>
      <div className="topbar-title">
        <h1 className="topbar-h1">{title}</h1>
        {subtitle && <p className="topbar-sub">{subtitle}</p>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </>
  );
  return slot ? createPortal(content, slot) : <header className="page-header">{content}</header>;
}
