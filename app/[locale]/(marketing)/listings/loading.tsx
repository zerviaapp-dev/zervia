/**
 * Loading skeleton for listing detail pages.
 * Shown during the server-component data fetch.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-6 animate-pulse" aria-busy="true">
      {/* Breadcrumb */}
      <div className="h-4 w-48 bg-gray-200 rounded" />
      {/* Title + provider */}
      <div className="mt-4 space-y-2">
        <div className="h-9 w-3/4 bg-gray-200 rounded-lg" />
        <div className="h-5 w-1/3 bg-gray-200 rounded" />
      </div>
      {/* Photo gallery */}
      <div className="mt-6 h-72 bg-gray-200 rounded-2xl" />
      {/* Details + booking panel */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
          <div className="h-5 w-40 bg-gray-200 rounded pt-2" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <div className="h-56 bg-gray-200 rounded-2xl" />
          <div className="h-12 bg-gray-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}
