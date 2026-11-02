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
 * Passing an audit earns the 🏅 Audited badge only — no fee effect.
 *
 * FEES — Oct 20, 2026 connector model (MAJ-1): Zervia charges NO
 * per-job platform fee and no commission. Customers book and pay
 * providers directly. Zervia charges only for its own products
 * (optional subscriptions, featured boosts, digital products). The
 * dormant platform-fee engine in lib/pricing.ts belongs to the gated
 * first-party booking model (SERVICE_BOOKING_LIVE, default OFF) and
 * must not be described in this agreement while that model is off.
 */

/** Bump when the wording changes so re-acceptance can be required. */
export const PROVIDER_AGREEMENT_VERSION = '2026-10-21-v5';

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
    'Providers who PASS an audit earn the 🏅 Audited badge on their profile and listings for 6 months. The badge expires after 6 months and a new audit is required to renew it. Passing an audit never changes what you pay — Zervia charges no per-job platform fee.',
    'Audits are quality checks only. They never charge you, never hold your money, and never involve your bank or Stripe account in any way.',
  ],
};

/**
 * Community Providers section (two-tier launch, Oct 21, 2026).
 * WORKING DRAFT — pending Goodlawyer review; never describe this
 * agreement as lawyer-approved. The disclaimer text is the single
 * source in lib/provider-tiers.ts (COMMUNITY_DISCLAIMER_EN).
 */
export const COMMUNITY_CLAUSE: AgreementSection = {
  title: 'Community Providers (Non-Verified Tier)',
  clauses: [
    'Zervia is a connector, not a service provider. Community Providers are independent individuals who have not been identity-checked, background-checked, or licensed-verified by Zervia. Zervia is not their employer or agent, is not a party to any agreement a customer makes with them, and does not guarantee their identity, quality, availability, or safety. Any hiring, payment, and arrangement is directly between the customer and the provider, at the customer\u2019s own risk.',
    'If you join as a Community Provider, you accept that your listings are labelled \u201cCommunity Provider \u2014 Location verified \u00b7 Identity not checked by Zervia\u201d on every card, profile, and contact prompt, and that you must never describe yourself as verified, licensed, background-checked, or endorsed by Zervia.',
    'Community Providers may list only low-risk services (tutoring and lessons, errands, cleaning help, yard help, moving help, design and online services, handyman help, pet care, event help), only in Canada, and may have at most 2 active listings. Licensed and high-risk work \u2014 legal, insurance, mortgage, electrical, plumbing, gas/HVAC, financial advice, solo childcare, and elder or personal care \u2014 is for Verified Providers only.',
    'Community Providers keep a current phone number and confirmed email on file, respond to the customers who contact them, and follow the same safety, honesty, and prohibited-conduct rules as every provider. Two substantiated complaints suspend a Community Provider\u2019s listings pending a human admin review; the provider is notified with reasons and may appeal through support.',
    'A Community Provider may upgrade to Verified at any time by completing Zervia\u2019s government ID verification (and licence verification where the category requires it). On approval, the Verified badge, ranking, Featured eligibility, and licensed categories apply.',
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
      'Zervia charges NO per-job platform fee and no commission on your work. Customers discover you on Zervia and book and pay you directly on your own site — your earnings are yours.',
      'The only things Zervia itself charges for are its own products: optional provider subscriptions (Pro CA$19/month, Business CA$49/month), featured boosts, and Zervia\u2019s digital products. Prices and currency are always shown before you pay, and a subscription can be cancelled anytime.',
      'Passing a quality audit never changes what you pay — it earns the 🏅 Audited badge for 6 months.',
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
      'Broken promises are recorded offences: not showing up for a job you accepted (no-show), being unreachable after you accepted a job, or cancelling at the last minute without a genuine emergency. Each substantiated offence is recorded, counts in the rolling 30-day window used for trust scoring and moderation, and two substantiated complaints suspend your listings pending a human review.',
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
      'Zervia\u2019s liability to you is capped at the amounts you have paid Zervia for its own products (subscriptions, boosts, and digital products) in the prior 12 months.',
      'High-risk trades (renovation, electrical, plumbing, roofing, HVAC, solar) must carry at least $1,000,000 CAD in liability insurance.',
      'No automated suspensions — a human always reviews before any warning or suspension, and you can appeal within 7 days.',
      'Disputes go through mediation first, then binding arbitration in Calgary, Alberta.',
    ],
  },
  AUDIT_CLAUSE,
  COMMUNITY_CLAUSE,
];

/** Full agreement text for display / download. */
export function providerAgreementText(): string {
  return PROVIDER_AGREEMENT_SECTIONS.map(
    (s, i) => `${i + 1}. ${s.title}\n${s.clauses.map((c) => `   • ${c}`).join('\n')}`
  ).join('\n\n');
}
