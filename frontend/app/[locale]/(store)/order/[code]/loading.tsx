/** Order tracking skeleton. */
export default function OrderLoading() {
  return (
    <div className="container-page flex flex-col gap-6 py-8" aria-busy="true" aria-label="Loading">
      <span className="skeleton h-10 w-72" />
      <span className="skeleton h-14 w-full" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <span className="skeleton h-64" />
        <span className="skeleton h-64" />
      </div>
    </div>
  );
}
