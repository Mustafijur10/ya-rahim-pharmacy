"use client";

import { FileText, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import type { AdminPrescription } from "@/lib/admin-types";

// Full class names so Tailwind keeps them.
const ROTATE = ["rotate-0", "rotate-90", "rotate-180", "-rotate-90"];

/** Prescription pages with zoom, rotate and page switch (design: Online orders › detail). */
export default function RxViewer({ rx }: { rx: AdminPrescription | null | undefined }) {
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState(0);
  const [zoom, setZoom] = useState(false);
  const pages = rx?.pages ?? [];
  const current = pages[Math.min(page, pages.length - 1)];

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className={zoom ? "rx-view rx-view-zoom" : "rx-view"}>
        {!current ? (
          <span className="flex flex-col items-center gap-2 text-sm text-muted">
            <FileText size={40} aria-hidden="true" />
            No prescription uploaded yet
          </span>
        ) : current.mime === "application/pdf" ? (
          <a href={current.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-sm font-medium">
            <FileText size={40} aria-hidden="true" />
            Open PDF prescription
          </a>
        ) : (
          <a href={current.url} target="_blank" rel="noreferrer" className="rx-view-link" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, signed-in file stream; next/image can't fetch it */}
            <img src={current.url} alt={`Prescription page ${page + 1}`} className={`rx-view-img ${ROTATE[turn]} ${zoom ? "scale-150" : ""}`} />
          </a>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="rx-tool" onClick={() => setZoom((z) => !z)} disabled={!current} aria-pressed={zoom}>
          {zoom ? <ZoomOut size={16} aria-hidden="true" /> : <ZoomIn size={16} aria-hidden="true" />}
          Zoom
        </button>
        <button type="button" className="rx-tool" onClick={() => setTurn((t) => (t + 1) % 4)} disabled={!current}>
          <RotateCw size={16} aria-hidden="true" />
          Rotate
        </button>
        <button type="button" className="rx-tool" onClick={() => setPage((p) => (p + 1) % Math.max(1, pages.length))} disabled={pages.length < 2}>
          Page {pages.length ? page + 1 : 0} / {pages.length}
        </button>
      </div>
    </div>
  );
}
