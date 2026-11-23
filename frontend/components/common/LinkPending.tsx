"use client";

import { useLinkStatus } from "next/link";

/**
 * Put inside a <Link>: shows a small spinner while that navigation is in progress.
 * Hidden for fast navigations (CSS delays it ~120ms), so it only appears when a page is slow.
 */
export default function LinkPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`link-pending ${pending ? "link-pending-on" : ""} ${className}`} />;
}
