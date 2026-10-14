import Link from 'next/link';

const ADMIN_SECTIONS = [
  { href: '/app/admin/providers', title: 'Providers', desc: 'Manage provider accounts and approvals' },
  { href: '/app/admin/verification', title: 'Verification', desc: 'Review identity verification submissions' },
  { href: '/app/admin/bookings', title: 'Bookings', desc: 'View and manage all bookings' },
  { href: '/app/admin/disputes', title: 'Disputes', desc: 'Handle customer-provider disputes' },
  { href: '/app/admin/guarantee', title: 'Guarantee Claims', desc: 'Review First-Session Guarantee refund requests' },
  { href: '/app/admin/moderation', title: 'Moderation', desc: 'Review reported listings and content' },
  { href: '/app/admin/audits', title: 'Audits', desc: 'Provider audit results and scheduling' },
  { href: '/app/admin/revenue', title: 'Revenue', desc: 'Platform revenue and analytics' },
  { href: '/app/admin/payouts', title: 'Payouts', desc: 'Provider payouts and Connect status' },
];

export default function AdminDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ADMIN_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow border"
          >
            <h2 className="text-lg font-semibold mb-2">{section.title}</h2>
            <p className="text-gray-600 text-sm">{section.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
