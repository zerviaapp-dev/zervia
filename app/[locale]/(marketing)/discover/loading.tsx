/**
 * Loading skeleton for the Discover marketplace page.
 * Shown during the server-component data fetch.
 */
export default function Loading() {
  return (
    <div className="px-5 pb-10 pt-6 animate-pulse" aria-busy="true">
      {/* Hero / search */}
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-10 w-3/4 bg-gray-200 rounded-lg" />
        <div className="h-14 bg-gray-200 rounded-3xl" />
      </div>
      {/* Category chips */}
      <div className="mx-auto mt-6 flex max-w-5xl flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-24 bg-gray-200 rounded-full" />
        ))}
      </div>
      {/* Listing cards grid */}
      <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-gray-100 p-4">
            <div className="h-40 bg-gray-200 rounded-xl" />
            <div className="h-5 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
            <div className="flex justify-between">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-8 w-24 bg-gray-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
