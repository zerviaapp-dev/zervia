'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  createListing,
  updateListing,
  type ActionResult,
} from '@/lib/supabase/provider-actions';
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
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Panel } from '@/components/Panel';
import { PhotoUploader } from '@/components/provider/PhotoUploader';

const initialState: ActionResult = { ok: false, message: '' };

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
  const locale = useLocale();
  const [state, formAction] = useActionState(
    isEdit ? updateListing : createListing,
    initialState
  );

  // Subcategory options follow the selected category.
  const [selectedCategory, setSelectedCategory] = useState<string>(
    defaults.category || 'cleaning'
  );
  const activeSubcategories: readonly Subcategory[] = isCategory(selectedCategory)
    ? subcategories[selectedCategory as Category]
    : [];

  const inputClass = 'auth-input w-full rounded-2xl px-4 py-4 text-base';

  return (
    <form action={formAction} className="space-y-5">
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
                defaultValue={defaults.price}
                placeholder={t('priceHint')}
                className={inputClass}
                pattern="\d+(\.\d{1,2})?"
              />
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
                defaultValue={defaults.country}
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

      {state.message ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <SubmitButton>
        {isEdit ? t('saveChanges') : t('createListingButton')}
      </SubmitButton>
    </form>
  );
}
