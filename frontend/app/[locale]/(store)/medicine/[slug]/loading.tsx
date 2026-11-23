/** Product page skeleton: photo left, details right. */
export default function MedicineLoading() {
  return (
    <div className="container-page flex flex-col gap-6 py-6" aria-busy="true" aria-label="Loading">
      <span className="skeleton h-5 w-72" />
      <div className="grid gap-8 lg:grid-cols-2">
        <span className="skeleton h-80 md:h-[420px]" />
        <div className="flex flex-col gap-4">
          <span className="skeleton h-6 w-40" />
          <span className="skeleton h-10 w-3/4" />
          <span className="skeleton h-5 w-1/2" />
          <span className="skeleton h-16 w-full" />
          <span className="skeleton h-12 w-48" />
          <span className="skeleton h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
