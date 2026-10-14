/**
 * Loading skeleton for the customer dashboard.
 * Shown during the server-component data fetch.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-5 animate-pulse" aria-busy="true">
      {/* Welcome header */}
      <div className="h-8 w-64 bg-gray-200 rounded-lg" />
      {/* Stat cards row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
      {/* Offers panel */}
      <div className="h-24 bg-gray-200 rounded-2xl" />
      {/* Profile card */}
      <div className="space-y-2 bg-gray-100 rounded-2xl p-4">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-56 bg-gray-200 rounded" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
      {/* Bookings card */}
      <div className="space-y-3 bg-gray-100 rounded-2xl p-4">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-72 bg-gray-200 rounded" />
        <div className="h-11 w-36 bg-gray-200 rounded-full" />
      </div>
    </div>
  );
}
