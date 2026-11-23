/** Shown instantly while a store page loads. */
export default function StoreLoading() {
  return (
    <div className="container-page flex flex-col gap-6 py-8" aria-busy="true" aria-label="Loading">
      <span className="skeleton h-5 w-48" />
      <span className="skeleton h-10 w-80" />
      <div className="product-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="skeleton h-72" />
        ))}
      </div>
    </div>
  );
}
