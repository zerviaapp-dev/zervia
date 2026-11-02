/**
 * Loading skeleton for the booking detail page.
 * Shown during the server-component data fetch. Mirrors the page's
 * sections: header + status, quote card, chat, review.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      {/* Header: title + status pill */}
      <div className="space-y-2">
        <div className="h-9 w-3/4 bg-gray-200 rounded-lg" />
        <div className="h-6 w-32 bg-gray-200 rounded-full" />
      </div>
      {/* Quote card */}
      <div className="rounded-2xl bg-gray-100 p-5 space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-2/3 bg-gray-200 rounded" />
        <div className="h-12 w-44 bg-gray-200 rounded-full" />
      </div>
      {/* Chat */}
      <div className="rounded-2xl bg-gray-100 p-5 space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        <div className="h-16 bg-gray-200 rounded-2xl" />
        <div className="h-16 w-3/4 bg-gray-200 rounded-2xl ml-auto" />
        <div className="h-12 bg-gray-200 rounded-full" />
      </div>
      {/* Review */}
      <div className="rounded-2xl bg-gray-100 p-5 space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-12 w-40 bg-gray-200 rounded-full" />
      </div>
    </div>
  );
}
