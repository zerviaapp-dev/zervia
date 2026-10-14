/**
 * Zervia Provider Agreement (plain-language terms).
 *
 * Every provider accepts this during onboarding (see
 * `components/provider/OnboardingWizard.tsx` — the agreement checkbox on
 * the review step). Acceptance is recorded on the provider row
 * (`agreement_version`, `agreement_accepted_at`).
 *
 * IMPORTANT — audits never touch money:
 * Audits are QUALITY checks only. No audit ever charges, refunds,
 * holds, or moves money. Stripe is not involved in any audit step.
 * The only money effect is the *fee discount* described below, which
 * applies automatically to future bookings through the normal
 * platform-fee engine (lib/pricing.ts).
 */

/** Bump when the wording changes so re-acceptance can be required. */
export const PROVIDER_AGREEMENT_VERSION = '2026-10-11-v3';

export interface AgreementSection {
  title: string;
  clauses: string[];
}

/**
 * Section 7 — Quality Audits. Shown verbatim (translated) in onboarding.
 */
export const AUDIT_CLAUSE: AgreementSection = {
  title: 'Quality Audits',
  clauses: [
    'Zervia runs random quality audits on active providers. Every active provider can be selected at any time; new providers and lower-rated providers are selected more often.',
    'Each audit scores six checks out of 100: profile completeness (15), response time (15), review score (25), booking completion rate (20), ID verification status (15), and complaints (10).',
    'Scores of 80+ pass, 50–79 receive a warning, and below 50 may be suspended. A Zervia team member always reviews the automated score before any warning or suspension is issued — the system never suspends anyone by itself.',
    'A warning lists exactly what to fix and gives you 7 days to fix it. Fix it in time and your account stays in good standing.',
    'Providers who PASS an audit earn the 🏅 Audited badge on their profile and listings, plus a lower platform fee for 6 months: free providers pay 8% instead of 10%, and members pay 4% instead of 5%. The badge and discount expire after 6 months and a new audit is required to renew them.',
    'Audits are quality checks only. They never charge you, never hold your money, and never involve your bank or Stripe account in any way.',
  ],
};

export const PROVIDER_AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: 'Your Account',
    clauses: [
      'You are responsible for keeping your business information accurate and up to date.',
      'One provider account per person or business.',
    ],
  },
  {
    title: 'Your Listings',
    clauses: [
      'List only services you can actually deliver, at prices you will honor.',
      'Keep your availability and service area current.',
    ],
  },
  {
    title: 'Bookings & Customers',
    clauses: [
      'Respond to booking requests and messages promptly.',
      'Complete accepted bookings or cancel with reasonable notice.',
    ],
  },
  {
    title: 'Fees',
    clauses: [
      'Zervia charges a platform fee on completed bookings: 10% for free providers, 5% for members. The exact fee is always shown to you before you accept or complete a booking.',
      'Passing a quality audit lowers your fee to 8% (free) or 4% (members) for 6 months.',
    ],
  },
  {
    title: 'Reviews',
    clauses: [
      'Customers may leave public reviews after completed bookings.',
      'Never offer payment or discounts in exchange for positive reviews.',
    ],
  },
  {
    title: 'Prohibited Conduct',
    clauses: [
      'No spam, scams, fake reviews, or misleading listings.',
      'Violations can lead to warnings, suspension, or removal.',
    ],
  },
  {
    title: 'Legal Protections',
    clauses: [
      'You are an independent contractor, NOT a Zervia employee. You set your own prices, hours, and methods. You handle your own taxes and insurance.',
      'You are SOLELY responsible for your products and services — quality, accuracy, deadlines, warranties, complaints, licenses, and safety. If your work causes damage or injury, that responsibility is yours, not Zervia\u2019s.',
      'Zervia is the marketplace, not the service provider. Your contract is with the customer, not with us.',
      'You will indemnify, defend, and hold harmless Zervia from any claim, demand, or proceeding arising from your services — including legal fees and damages. This does not apply to claims caused solely by Zervia\u2019s own negligence.',
      'Zervia\u2019s liability to you is capped at the platform fees earned from your transactions in the prior 12 months.',
      'High-risk trades (renovation, electrical, plumbing, roofing, HVAC, solar) must carry at least $1,000,000 CAD in liability insurance.',
      'No automated suspensions — a human always reviews before any warning or suspension, and you can appeal within 7 days.',
      'Disputes go through mediation first, then binding arbitration in Calgary, Alberta.',
    ],
  },
  AUDIT_CLAUSE,
];

/** Full agreement text for display / download. */
export function providerAgreementText(): string {
  return PROVIDER_AGREEMENT_SECTIONS.map(
    (s, i) => `${i + 1}. ${s.title}\n${s.clauses.map((c) => `   • ${c}`).join('\n')}`
  ).join('\n\n');
}
