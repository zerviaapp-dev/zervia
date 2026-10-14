'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  categoryGroups,
  subcategories,
  isCategory,
  priceTypes,
  listingStatuses,
  type Category,
  type PriceType,
  type Subcategory,
} from '@/lib/categories';
import { Field } from '@/components/auth/Field';
import { Panel } from '@/components/Panel';
import { PhotoUploader } from '@/components/provider/PhotoUploader';
import { LocationPicker, type MapCoords } from '@/components/maps/LocationPicker';
import { suggestPriceRange } from '@/lib/smart-pricing';
import { formatCurrency, currencyForCountry } from '@/lib/currency';

export type ListingDefaults = {
  id?: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price: string; // display string, e.g. "49.99" — converted to cents server-side
  priceType: PriceType;
  country: string;
  city: string;
  status: string;
  photos: string[];
  /** Optional map pin; null until the provider drops one. */
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Create / edit a listing. Client-side validation mirrors the server action;
 * the server validates again and RLS enforces ownership.
 */
export function ListingForm({
  defaults,
  countries,
  isEdit,
}: {
  defaults: ListingDefaults;
  countries: { code: string; name: string }[];
  isEdit: boolean;
}) {
  const t = useTranslations('Provider');
  const tc = useTranslations('Categories');
  const tcg = useTranslations('CategoryGroups');
  const ts = useTranslations('Subcategories');
  const tm = useTranslations('Maps');
  const locale = useLocale();
  // Use fetch to API route instead of useActionState (was causing client crashes)
  const [submitState, setSubmitState] = useState<{ ok: boolean; message: string }>({ ok: false, message: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form element synchronously (e.currentTarget can be nullified in async handlers)
    const formEl = e.currentTarget;
    try {
      const formData = new FormData(formEl);
      setSubmitting(true);
      setSubmitState({ ok: false, message: '' });
      const res = await fetch('/api/provider/listings', {
        method: 'POST',
        body: formData,
      });
      let data;
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        console.error('[listing] Failed to parse JSON, status:', res.status);
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
      console.error('[listing] Submit error:', err);
      setSubmitState({ ok: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // Subcategory options follow the selected category.
  const [selectedCategory, setSelectedCategory] = useState<string>(
    defaults.category || 'cleaning'
  );
  const activeSubcategories: readonly Subcategory[] = isCategory(selectedCategory)
    ? subcategories[selectedCategory as Category]
    : [];

  // Smart pricing hint follows category + country.
  const [selectedCountry, setSelectedCountry] = useState<string>(
    defaults.country || 'CA'
  );
  const [priceValue, setPriceValue] = useState<string>(defaults.price || '');
  const priceSuggestion = suggestPriceRange(selectedCategory, selectedCountry);
  const suggestionCurrency = currencyForCountry(selectedCountry);

  // Optional map pin for the listing. Submitted through hidden inputs so
  // the server action receives lat/lng like every other field.
  const [coords, setCoords] = useState<MapCoords | null>(
    defaults.latitude != null && defaults.longitude != null
      ? { lat: defaults.latitude, lng: defaults.longitude }
      : null
  );

  const inputClass = 'auth-input w-full rounded-2xl px-4 py-4 text-base';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <Panel>
        <div className="space-y-5">
          <Field label={t('serviceTitle')} htmlFor="title">
            <input
              id="title"
              name="title"
              defaultValue={defaults.title}
              placeholder={t('serviceTitleHint')}
              className={inputClass}
              maxLength={120}
              required
              minLength={3}
            />
          </Field>

          <Field label={t('categoryLabel')} htmlFor="category">
            <select
              id="category"
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={inputClass}
              required
            >
              {categoryGroups.map((group) => (
                <optgroup key={group.key} label={tcg(group.key)}>
                  {group.categories.map((c) => (
                    <option key={c} value={c}>
                      {tc(c)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label={t('subcategoryLabel')} htmlFor="subcategory">
            <select
              id="subcategory"
              name="subcategory"
              key={selectedCategory}
              defaultValue={
                defaults.subcategory &&
                activeSubcategories.includes(defaults.subcategory as Subcategory)
                  ? defaults.subcategory
                  : ''
              }
              className={inputClass}
            >
              <option value="">{t('subcategoryHint')}</option>
              {activeSubcategories.map((s) => (
                <option key={s} value={s}>
                  {ts(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('serviceDescription')} htmlFor="description">
            <textarea
              id="description"
              name="description"
              defaultValue={defaults.description}
              placeholder={t('serviceDescriptionHint')}
              className={`${inputClass} min-h-[120px]`}
              maxLength={2000}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label={`${t('price')} (${t('priceOptional')})`}
              htmlFor="price"
            >
              <input
                id="price"
                name="price"
                inputMode="decimal"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                placeholder={t('priceHint')}
                className={inputClass}
                pattern="\d+(\.\d{1,2})?"
              />
              {priceSuggestion ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2.5">
                  <p className="text-sm text-brand-800">
                    💡{' '}
                    {t('smartPriceHint', {
                      min: formatCurrency(
                        priceSuggestion.minCents,
                        suggestionCurrency,
                        locale
                      ),
                      max: formatCurrency(
                        priceSuggestion.maxCents,
                        suggestionCurrency,
                        locale
                      ),
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setPriceValue(
                        (priceSuggestion.midCents / 100).toFixed(2)
                      )
                    }
                    className="inline-flex min-h-[40px] items-center rounded-full bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    {t('smartPriceApply', {
                      price: formatCurrency(
                        priceSuggestion.midCents,
                        suggestionCurrency,
                        locale
                      ),
                    })}
                  </button>
                </div>
              ) : null}
            </Field>
            <Field label={t('priceType')} htmlFor="priceType">
              <select
                id="priceType"
                name="priceType"
                defaultValue={defaults.priceType}
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

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('countryLabel')} htmlFor="country">
              <select
                id="country"
                name="country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className={inputClass}
                required
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
                name="city"
                defaultValue={defaults.city}
                placeholder={t('cityHint')}
                className={inputClass}
                maxLength={120}
              />
            </Field>
          </div>

          <Field label={tm('pickerLabel')} htmlFor="listing-location">
            <LocationPicker
              id="listing-location"
              value={coords}
              onChange={setCoords}
            />
            <input
              type="hidden"
              name="latitude"
              value={coords ? String(coords.lat) : ''}
            />
            <input
              type="hidden"
              name="longitude"
              value={coords ? String(coords.lng) : ''}
            />
          </Field>

          <Field label={t('listingStatus')} htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={defaults.status}
              className={inputClass}
            >
              {listingStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(`status${s[0].toUpperCase()}${s.slice(1)}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('photosLabel')} htmlFor="photos-uploader">
            <PhotoUploader initialPhotos={defaults.photos} inputName="photos" />
          </Field>
        </div>
      </Panel>

      {submitState.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {submitState.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {submitting ? '…' : (isEdit ? t('saveChanges') : t('createListingButton'))}
      </button>
    </form>
  );
}
