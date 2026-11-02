/**
 * Loading skeleton for the provider dashboard.
 * Shown during the server-component data fetch.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-5 animate-pulse" aria-busy="true">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="h-8 w-56 bg-gray-200 rounded-lg" />
        <div className="h-11 w-40 bg-gray-200 rounded-full" />
      </div>
      {/* Status banners */}
      <div className="h-12 bg-gray-200 rounded-2xl" />
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
      {/* My listings */}
      <div className="space-y-3">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
      </div>
      {/* Tier / earnings panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="h-36 bg-gray-200 rounded-2xl" />
        <div className="h-36 bg-gray-200 rounded-2xl" />
      </div>
    </div>
  );
}
