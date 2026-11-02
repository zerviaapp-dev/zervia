/**
 * Loading skeleton for the "My bookings" list page.
 * Shown during the server-component data fetch.
 */
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true">
      {/* Title */}
      <div className="h-9 w-56 bg-gray-200 rounded-lg" />
      {/* Booking cards */}
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-gray-100 p-5 space-y-3">
            <div className="h-6 w-2/3 bg-gray-200 rounded" />
            <div className="h-4 w-1/3 bg-gray-200 rounded" />
            <div className="flex gap-3 pt-1">
              <div className="h-10 w-28 bg-gray-200 rounded-full" />
              <div className="h-10 w-28 bg-gray-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
