/** Shown instantly while an admin page loads (header + tiles + panels skeleton). */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <span className="skeleton h-8 w-64" />
      <div className="kpi-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <span className="skeleton h-72" />
        <span className="skeleton h-72" />
      </div>
    </div>
  );
}
