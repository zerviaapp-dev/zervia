import { Link } from '@/i18n/routing';
import { Panel } from '@/components/Panel';
import { Reveal } from '@/components/Reveal';

/**
 * Public provider landing page — the front door for cold-email recipients.
 *
 * "Become a Provider" links from the marketing nav and footer land here.
 * Content is in English (the canonical version); a note explains that
 * translations are in progress for non-English locales.
 *
 * Founding-provider offer matches the outreach pitch: completely free
 * for founding providers (free listing + free Pro features).
 */
export default async function ProvidersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const steps = [
    {
      n: '1',
      title: 'Sign up free',
      desc: 'Create your provider account in minutes. No credit card required for founding providers.',
    },
    {
      n: '2',
      title: 'Create your listing',
      desc: 'Describe your services, set your prices, add photos. ID-checked listings go live once our team approves your ID — usually within a day. On the free Community tier, no government ID is required: we review every Community listing by hand before it goes live (Canada only, up to 2 active listings, low-risk services only).',
    },
    {
      n: '3',
      title: 'Get discovered',
      desc: 'Customers find you on Zervia and book and pay on your own site. You focus on the work.',
    },
  ];

  const benefits = [
    {
      title: 'Direct customer bookings',
      desc: 'Customers discover you on Zervia and book on your own booking page. No lead fees, no commission on your work.',
    },
    {
      title: 'Customer reviews',
      desc: 'Build your reputation with reviews from real customers.',
    },
    {
      title: 'Your prices, your payments',
      desc: 'Customers pay you directly through your own booking page — you set the prices and the payment terms, so you always know what you will earn.',
    },
    {
      title: 'Your business, your brand',
      desc: 'Your listing, your prices, your schedule. Zervia brings the customers — you run the business.',
    },
  ];

  const faqs = [
    {
      q: 'What does it cost to join as a founding provider?',
      a: 'Nothing. Founding providers get a free listing and free Pro features — no subscription, no lead fees — free until billing opens at launch. No card required, nothing is charged today, and terms will be announced before any charge is ever made. We are keeping the first group small on purpose.',
    },
    {
      q: 'How do I get paid?',
      a: 'Customers pay you directly through your own booking or payment page — Zervia never takes payment for your services and takes no cut of your work. You pay only your optional subscription (Pro CA$19/month, Business CA$49/month) if you choose one.',
    },
    {
      q: 'What services can I offer?',
      a: 'Home services (cleaning, plumbing, electrical, handyman, moving, yard work), personal care (beauty, fitness, massage), family and learning (caregiving, cooking, tutoring), errands, tech help, and business services.',
    },
    {
      q: 'Do I need to be a registered business?',
      a: 'No. Independent professionals and small teams are welcome. Providers on the ID-checked tier confirm their identity with ID; Community-tier listings are reviewed by hand before they go live — those two checks reduce risk for everyone.',
    },
    {
      q: 'What happens after the founding period?',
      a: 'Founding providers stay free until billing opens at launch — and terms will be announced before any charge is ever made; nobody is ever charged by surprise. Regular plans are simple: Starter is free, Pro is CA$19/month, Business is CA$49/month. Once billing is live you can upgrade, downgrade, or cancel anytime.',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      {locale !== 'en' && (
        <Panel className="mb-8">
          <p className="text-sm leading-relaxed text-brand-700">
            <strong>Note:</strong> This page is currently available in English.
            Translations are in progress.
          </p>
        </Panel>
      )}

      {/* Hero */}
      <Reveal>
      <section className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
          For service providers
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-brand-950 sm:text-5xl">
          Join Zervia as a Founding Provider
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
          Get discovered by customers looking for exactly what you offer.
          Free listing, free Pro features, no lead fees — free until billing opens at launch.
        </p>
        <div className="mt-8">
          <Link
            href="/signup?type=provider"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800"
          >
            Sign up as a provider — it&apos;s free
          </Link>
          <p className="mt-3 text-sm text-slate-500">
            No credit card required for founding providers.
          </p>
        </div>
      </section>
      </Reveal>

      {/* Founding offer banner */}
      <Reveal>
      <section className="mt-12">
        <Panel className="border-2 border-brand-600 bg-brand-50">
          <h2 className="text-2xl font-extrabold text-brand-900">
            Founding provider offer
          </h2>
          <ul className="mt-4 space-y-2 text-base leading-relaxed text-brand-800">
            <li>✓ Free business listing, visible to customers in your area</li>
            <li>✓ Free Pro features — more listings, priority placement</li>
            <li>✓ No subscription, no lead fees — free until billing opens at launch; terms announced before any charge is ever made</li>
            <li>✓ Direct access to our team while we grow together</li>
          </ul>
          <p className="mt-4 text-sm text-brand-700">
            We are keeping the first group small on purpose — we want
            providers we would recommend to our own families.
          </p>
        </Panel>
      </section>
      </Reveal>

      {/* How it works */}
      <Reveal>
      <section className="mt-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          How it works
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <Panel>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-extrabold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 text-lg font-bold text-brand-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {s.desc}
                </p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>
      </Reveal>

      {/* Benefits */}
      <Reveal>
      <section className="mt-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          What you get
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 100}>
              <Panel>
                <h3 className="text-lg font-bold text-brand-900">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {b.desc}
                </p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>
      </Reveal>

      {/* Pricing clarity */}
      <Reveal>
      <section className="mt-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          Simple pricing
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Panel>
            <h3 className="text-lg font-bold text-brand-900">Starter</h3>
            <p className="mt-1 text-3xl font-extrabold text-brand-950">
              Free
            </p>
            <p className="mt-2 text-sm text-slate-600">
              1 business listing, unlimited booking requests, customer reviews.
            </p>
          </Panel>
          <Panel className="border-2 border-brand-600">
            <div className="inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Founding providers: free
            </div>
            <h3 className="mt-2 text-lg font-bold text-brand-900">Pro</h3>
            <p className="mt-1 text-3xl font-extrabold text-brand-950">
              CA$19<span className="text-base font-medium">/mo</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              5 listings, featured-eligible listings, priority placement in Discover, booking insights.
            </p>
          </Panel>
          <Panel>
            <h3 className="text-lg font-bold text-brand-900">Business</h3>
            <p className="mt-1 text-3xl font-extrabold text-brand-950">
              CA$49<span className="text-base font-medium">/mo</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Unlimited listings, everything in Pro, early access to new Business features, dedicated support.
            </p>
          </Panel>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          All prices in Canadian dollars (CAD). Zervia takes no per-job fee —
          providers pay only their optional subscription.
        </p>
      </section>
      </Reveal>

      {/* FAQ */}
      <Reveal>
      <section className="mt-12">
        <h2 className="text-center text-2xl font-extrabold text-brand-950 sm:text-3xl">
          Common questions
        </h2>
        <div className="mt-8 space-y-4">
          {faqs.map((f, i) => (
            <Reveal key={f.q} delay={Math.min(i, 3) * 60}>
              <Panel>
                <h3 className="text-base font-bold text-brand-900">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {f.a}
                </p>
              </Panel>
            </Reveal>
          ))}
        </div>
      </section>
      </Reveal>

      {/* Final CTA */}
      <Reveal>
      <section className="mt-12 text-center">
        <h2 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">
          Ready to grow your business?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">
          Join the founding providers on Zervia. Free to start, built for
          providers like you.
        </p>
        <div className="mt-8">
          <Link
            href="/signup?type=provider"
            className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800"
          >
            Sign up as a provider — it&apos;s free
          </Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          By signing up you agree to our{' '}
          <Link href="/terms" className="text-brand-600 hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link
            href="/provider-agreement"
            className="text-brand-600 hover:underline"
          >
            Provider Agreement
          </Link>
          .
        </p>
      </section>
      </Reveal>
    </div>
  );
}
