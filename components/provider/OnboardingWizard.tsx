'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { categoryGroups, priceTypes, type Category, type PriceType } from '@/lib/categories';
import { currencyForCountry, currencySymbol } from '@/lib/currency';
import { locales, localeNames, type Locale } from '@/lib/locales';
import { Field } from '@/components/auth/Field';
import { Panel } from '@/components/Panel';
import { IdUploader } from '@/components/provider/IdUploader';

type WizardState = {
  businessName: string;
  businessDescription: string;
  category: Category | '';
  serviceTitle: string;
  serviceDescription: string;
  price: string;
  priceType: PriceType;
  country: string;
  city: string;
  phone: string;
  whatsapp: string;
  languages: Locale[];
  agreementAccepted: boolean;
  /** Provider's initials as signature on the Provider Agreement (2-10 chars). */
  agreementInitials: string;
};

/**
 * 5-step provider onboarding: business info → category → first service →
 * contact + languages → review → submit. Creates a `pending` provider row
 * plus the first listing as a draft; an admin approves before anything
 * goes public. Every step validates client-side; the server validates again.
 */
export function OnboardingWizard({
  countries,
  defaultCountry,
  defaultLocale,
}: {
  countries: { code: string; name: string }[];
  defaultCountry: string;
  defaultLocale: Locale;
}) {
  const t = useTranslations('Provider');
  const tc = useTranslations('Categories');
  const locale = useLocale();
  // Use fetch to API route instead of useActionState (was causing client crashes)
  const [submitState, setSubmitState] = useState<{ ok: boolean; message: string }>({ ok: false, message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form element synchronously (e.currentTarget can be nullified in async handlers)
    const formEl = e.currentTarget;
    try {
      const formData = new FormData(formEl);
      setSubmitting(true);
      setSubmitState({ ok: false, message: '' });
      const res = await fetch('/api/provider/onboarding', {
        method: 'POST',
        body: formData,
      });
      let data;
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('[onboarding] Failed to parse JSON, status:', res.status);
        setSubmitState({ ok: false, message: `Server error (HTTP ${res.status}). Please try again.` });
        return;
      }
      if (data.ok) {
        const path = locale === 'en' ? '/app/provider' : `/${locale}/app/provider`;
        window.location.href = path;
      } else {
        setSubmitState({ ok: false, message: data.message || 'Something went wrong.' });
      }
    } catch (err) {
      console.error('[onboarding] Submit error:', err);
      setSubmitState({ ok: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // TEMPORARILY DISABLED: client redirect was suspected of causing crash.
  // If submit succeeds without crash, re-enable with a different approach.
  // useEffect(() => {
  //   if (state.ok) {
  //     const path = locale === 'en' ? '/app/provider' : `/${locale}/app/provider`;
  //     router.push(path);
  //   }
  // }, [state.ok, locale, router]);
  /** Government ID upload status — mandatory before submitting (Liz). */
  const [idUploaded, setIdUploaded] = useState(false);

  /** Form persistence: TEMPORARILY DISABLED 2026-10-11 — causing hydration crashes.
      Will re-enable with a safer implementation after CEO completes testing. */
  const STORAGE_KEY = 'zervia-onboarding-draft';
  const defaultForm: WizardState = {
    businessName: '',
    businessDescription: '',
    category: '',
    serviceTitle: '',
    serviceDescription: '',
    price: '',
    priceType: 'quote',
    country: defaultCountry,
    city: '',
    phone: '',
    whatsapp: '',
    languages: [defaultLocale],
    agreementAccepted: false,
    agreementInitials: '',
  };
  const [form, setForm] = useState<WizardState>(defaultForm);
  const [hydrated] = useState(true); // Persistence disabled; always "hydrated"
  const [step, setStep] = useState(0);

  // Save draft to localStorage — DISABLED (causing crashes, will re-enable later)
  // useEffect(() => {
  //   if (!hydrated) return;
  //   try {
  //     localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  //   } catch {
  //     // Storage full or unavailable — non-fatal
  //   }
  // }, [form, hydrated]);

  // useEffect(() => {
  //   if (!hydrated) return;
  //   try {
  //     localStorage.setItem(STORAGE_KEY + '-step', String(step));
  //   } catch {
  //     // Ignore
  //   }
  // }, [step, hydrated]);

  // Clear saved draft on successful submit
  useEffect(() => {
    if (submitState.ok) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + '-step');
      } catch {
        // Ignore
      }
    }
  }, [submitState.ok]);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const toggleLanguage = (code: Locale) => {
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((l) => l !== code)
        : [...f.languages, code],
    }));
  };

  /** Client-side validation for the current step. */
  function validateStep(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (form.businessName.trim().length < 2 || form.businessName.trim().length > 120)
        e.businessName = t('errorBusinessName');
      if (form.businessDescription.length > 2000)
        e.businessDescription = t('errorDescriptionTooLong');
    }
    if (step === 1 && !form.category) e.category = t('errorCategory');
    if (step === 2) {
      const title = form.serviceTitle.trim();
      if (title.length < 3 || title.length > 120) e.serviceTitle = t('errorTitle');
      if (form.serviceDescription.length > 2000)
        e.serviceDescription = t('errorDescriptionTooLong');
      if (form.price !== '' && !/^\d+(\.\d{1,2})?$/.test(form.price.trim()))
        e.price = t('errorPrice');
      if (form.price.trim() === '' && form.priceType !== 'quote')
        e.price = t('errorPriceRequired');
    }
    if (step === 3 && !form.country) e.country = t('errorCountry');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, 4));
      window.scrollTo({ top: 0 });
    }
  };
  const back = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const stepTitles = [
    t('stepBusiness'),
    t('stepCategory'),
    t('stepService'),
    t('stepContact'),
    t('stepReview'),
  ];

  const inputClass = 'auth-input w-full rounded-2xl px-4 py-4 text-base';

  /** Currency symbol for the price field, from the provider's selected country. */
  const priceCurrencySymbol = currencySymbol(currencyForCountry(form.country));
  /** Initials are valid as a signature: 2-10 characters. */
  const initialsValid =
    form.agreementInitials.trim().length >= 2 &&
    form.agreementInitials.trim().length <= 10;
  /** Submit requires: agreement checked + valid initials + ID uploaded (or test bypass). */
  const canSubmit = form.agreementAccepted && initialsValid && idUploaded;

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2" aria-label={t('onboardingTitle')}>
        {stepTitles.map((title, i) => (
          <li key={title} className="flex-1">
            <div
              className={`h-2 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-brand-100'}`}
              title={title}
            />
          </li>
        ))}
      </ol>
      <h1 className="text-3xl font-bold text-brand-900">{t('onboardingTitle')}</h1>
      <p className="mt-1 text-base font-semibold text-brand-700">
        {t('stepOf', { current: step + 1, total: 5 })} — {stepTitles[step]}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <input type="hidden" name="locale" value={locale} />
        {/* Carry every field through hidden inputs so the server action
            receives the full payload regardless of the visible step. */}
        <input type="hidden" name="businessName" value={form.businessName} />
        <input type="hidden" name="businessDescription" value={form.businessDescription} />
        <input type="hidden" name="category" value={form.category} />
        <input type="hidden" name="title" value={form.serviceTitle} />
        <input type="hidden" name="description" value={form.serviceDescription} />
        <input type="hidden" name="price" value={form.price} />
        <input type="hidden" name="priceType" value={form.priceType} />
        <input type="hidden" name="country" value={form.country} />
        <input type="hidden" name="city" value={form.city} />
        <input type="hidden" name="phone" value={form.phone} />
        <input type="hidden" name="whatsapp" value={form.whatsapp} />
        {form.languages.map((l) => (
          <input key={l} type="hidden" name="languages" value={l} />
        ))}
        <input
          type="hidden"
          name="agreementAccepted"
          value={form.agreementAccepted ? 'true' : 'false'}
        />
        <input type="hidden" name="agreementInitials" value={form.agreementInitials} />

        {step === 0 && (
          <Panel>
            <div className="space-y-5">
              <Field label={t('businessName')} error={errors.businessName} htmlFor="businessName">
                <input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => set('businessName', e.target.value)}
                  placeholder={t('businessNameHint')}
                  className={inputClass}
                  maxLength={120}
                />
              </Field>
              <Field
                label={t('businessDescription')}
                error={errors.businessDescription}
                htmlFor="businessDescription"
              >
                <textarea
                  id="businessDescription"
                  value={form.businessDescription}
                  onChange={(e) => set('businessDescription', e.target.value)}
                  placeholder={t('businessDescriptionHint')}
                  className={`${inputClass} min-h-[120px]`}
                  maxLength={2000}
                />
              </Field>
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel>
            <Field label={t('categoryLabel')} error={errors.category} htmlFor="category">
              <CategoryGroupFilter
                selectedGroup={selectedCategoryGroup}
                onSelect={setSelectedCategoryGroup}
                selectedCategory={form.category}
                onSelectCategory={(c) => set('category', c)}
              />
            </Field>
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <div className="space-y-5">
              <Field label={t('serviceTitle')} error={errors.serviceTitle} htmlFor="serviceTitle">
                <input
                  id="serviceTitle"
                  value={form.serviceTitle}
                  onChange={(e) => set('serviceTitle', e.target.value)}
                  placeholder={t('serviceTitleHint')}
                  className={inputClass}
                  maxLength={120}
                />
              </Field>
              <Field
                label={t('serviceDescription')}
                error={errors.serviceDescription}
                htmlFor="serviceDescription"
              >
                <textarea
                  id="serviceDescription"
                  value={form.serviceDescription}
                  onChange={(e) => set('serviceDescription', e.target.value)}
                  placeholder={t('serviceDescriptionHint')}
                  className={`${inputClass} min-h-[120px]`}
                  maxLength={2000}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`${t('price')} (${t('priceOptional')})`} error={errors.price} htmlFor="price">
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-brand-500"
                    >
                      {priceCurrencySymbol}
                    </span>
                    <input
                      id="price"
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => set('price', e.target.value)}
                      placeholder={t('priceHint')}
                      className={`${inputClass} pl-16`}
                    />
                  </div>
                </Field>
                <Field label={t('priceType')} htmlFor="priceType">
                  <select
                    id="priceType"
                    value={form.priceType}
                    onChange={(e) => set('priceType', e.target.value as PriceType)}
                    className={inputClass}
                  >
                    {priceTypes.map((p) => (
                      <option key={p} value={p}>
                        {t(`price${p[0].toUpperCase()}${p.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('countryLabel')} error={errors.country} htmlFor="country">
                  <select
                    id="country"
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t('countryHint')}</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('cityLabel')} htmlFor="city">
                  <input
                    id="city"
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder={t('cityHint')}
                    className={inputClass}
                    maxLength={120}
                  />
                </Field>
              </div>
              <Field label={t('phone')} htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder={t('phoneHint')}
                  className={inputClass}
                  maxLength={40}
                />
              </Field>
              <Field label={t('whatsapp')} htmlFor="whatsapp">
                <input
                  id="whatsapp"
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  placeholder={t('whatsappHint')}
                  className={inputClass}
                  maxLength={40}
                />
              </Field>
              <Field label={t('languagesLabel')} htmlFor="languages">
                <p className="mb-3 text-sm text-brand-700">{t('languagesHint')}</p>
                <div className="flex flex-wrap gap-2" id="languages">
                  {locales.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={form.languages.includes(l)}
                      onClick={() => toggleLanguage(l)}
                      className={`min-h-[44px] rounded-full border-2 px-4 text-sm font-semibold transition-colors ${
                        form.languages.includes(l)
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-brand-100 bg-white text-brand-800'
                      }`}
                    >
                      {localeNames[l]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Panel>
        )}

        {step === 4 && (
          <Panel>
            <h2 className="text-xl font-bold text-brand-900">{t('reviewTitle')}</h2>
            <dl className="mt-4 space-y-3 text-base">
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewBusiness')}</dt>
                <dd className="text-brand-800">
                  {form.businessName} · {form.category ? tc(form.category) : '—'}
                  {form.businessDescription ? ` — ${form.businessDescription}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewService')}</dt>
                <dd className="text-brand-800">
                  {form.serviceTitle}
                  {form.price.trim() !== ''
                    ? ` — ${priceCurrencySymbol}${form.price.trim()} (${t(`price${form.priceType[0].toUpperCase()}${form.priceType.slice(1)}`)})`
                    : ` — ${t('priceQuote')}`}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewContact')}</dt>
                <dd className="text-brand-800">
                  {[form.city, form.country].filter(Boolean).join(', ')}
                  {form.phone ? ` · ${form.phone}` : ''}
                  {form.whatsapp ? ` · WhatsApp ${form.whatsapp}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('languagesLabel')}</dt>
                <dd className="text-brand-800">
                  {form.languages.map((l) => localeNames[l]).join(', ') || '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
              {t('reviewNote')}
            </p>
            {/* Government ID verification — MANDATORY (Liz). The photo
                goes to a private bucket — never publicly visible. */}
            <div className="mt-4">
              <IdUploader alreadyProvided={false} onUploaded={() => setIdUploaded(true)} />
              {!idUploaded ? (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  {t('errorIdRequired')}
                </p>
              ) : null}
            </div>

            {/* Provider Agreement — must be accepted to submit.
                Section 7 (Quality Audits) is the audit clause Liz approved:
                random audits, scoring, and the 🏅 badge + fee discount. */}
            <div className="mt-6 rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4">
              <h3 className="text-base font-bold text-brand-900">
                {t('agreementTitle')}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-800">
                <li>{t('agreementQuality')}</li>
                <li>{t('agreementFees')}</li>
                <li>{t('agreementAudits')}</li>
                <li>{t('agreementLegal')}</li>
              </ul>
              <p className="mt-3 text-sm">
                <a
                  href={`/${locale}/provider-agreement`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-700 underline hover:text-brand-900"
                >
                  {t('agreementReadFullLink')}
                </a>
              </p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-brand-700">
                  {t('agreementReadFull')}
                </summary>
                <div className="mt-2 max-h-56 space-y-3 overflow-y-auto rounded-xl bg-white p-3 text-brand-800">
                  <p className="font-bold">{t('agreementAuditTitle')}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>{t('agreementAudit1')}</li>
                    <li>{t('agreementAudit2')}</li>
                    <li>{t('agreementAudit3')}</li>
                    <li>{t('agreementAudit4')}</li>
                    <li>{t('agreementAudit5')}</li>
                    <li>{t('agreementAudit6')}</li>
                  </ul>
                </div>
              </details>
              <label className="mt-3 flex min-h-[56px] cursor-pointer items-start gap-3 rounded-2xl bg-white p-3">
                <input
                  type="checkbox"
                  checked={form.agreementAccepted}
                  onChange={(e) => set('agreementAccepted', e.target.checked)}
                  className="mt-1 h-6 w-6 shrink-0 accent-brand-600"
                />
                <span className="text-sm font-semibold text-brand-900">
                  {t('agreementAccept')}
                </span>
              </label>
              {/* Initials as signature (Liz): required alongside the checkbox. */}
              <div className="mt-3">
                <label
                  htmlFor="agreementInitials"
                  className="mb-1 block text-sm font-semibold text-brand-900"
                >
                  {t('agreementInitials')}
                </label>
                <input
                  id="agreementInitials"
                  value={form.agreementInitials}
                  onChange={(e) => set('agreementInitials', e.target.value)}
                  placeholder={t('agreementInitialsHint')}
                  maxLength={10}
                  className="auth-input w-full max-w-[220px] rounded-2xl px-4 py-3 text-base uppercase"
                />
                {!initialsValid && form.agreementInitials.length > 0 ? (
                  <p className="mt-1 text-sm font-medium text-red-700">
                    {t('errorAgreementInitials')}
                  </p>
                ) : null}
              </div>
              {errors.agreementAccepted ? (
                <p className="mt-2 text-sm font-medium text-red-700">
                  {errors.agreementAccepted}
                </p>
              ) : null}
            </div>
          </Panel>
        )}

        {submitState.message ? (
          <p
            role={submitState.ok ? 'status' : 'alert'}
            className={`rounded-2xl px-4 py-3 text-sm font-medium ${
              submitState.ok
                ? 'bg-brand-50 text-brand-800'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {submitState.message}
          </p>
        ) : null}

        <div className="flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700"
            >
              {t('back')}
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
            >
              {t('next')}
            </button>
          ) : (
            <div className="flex-1">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {submitting ? '…' : t('submit')}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Category group filter for onboarding Step 2.
 * Shows group tabs at the top; clicking a group filters to show only
 * that group's categories. Clicking the active group again shows all.
 */
function CategoryGroupFilter({
  selectedGroup,
  onSelect,
  selectedCategory,
  onSelectCategory,
}: {
  selectedGroup: string | null;
  onSelect: (group: string | null) => void;
  selectedCategory: Category | '';
  onSelectCategory: (c: Category) => void;
}) {
  const tcg = useTranslations('CategoryGroups');
  const tc = useTranslations('Categories');

  const activeGroup = selectedGroup
    ? categoryGroups.find((g) => g.key === selectedGroup)
    : null;
  const groupsToShow = activeGroup ? [activeGroup] : categoryGroups;

  return (
    <div className="space-y-4" id="category">
      {/* Group filter tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by group">
        {categoryGroups.map((group) => {
          const isActive = selectedGroup === group.key;
          return (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(isActive ? null : group.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
              }`}
            >
              {tcg(group.key)}
            </button>
          );
        })}
      </div>

      {/* Categories (filtered by selected group, or all if none selected) */}
      <div className="space-y-5">
        {groupsToShow.map((group) => (
          <fieldset key={group.key}>
            <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-500">
              {tcg(group.key)}
            </legend>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={tcg(group.key)}>
              {group.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selectedCategory === c}
                  onClick={() => onSelectCategory(c)}
                  className={`min-h-[56px] rounded-2xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
                    selectedCategory === c
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-brand-100 bg-white text-brand-800 hover:border-brand-300'
                  }`}
                >
                  {tc(c)}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
