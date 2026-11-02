'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { NearMeMap, type MapListing } from './NearMeMap';

type View = 'list' | 'map';

/**
 * Client-side "List / Map" toggle for the Discover results. The existing
 * server-rendered list arrives as `children`; the map mounts only when the
 * Map view is selected (so the Maps script loads lazily on demand).
 */
export function DiscoverResults({
  mapListings,
  children,
}: {
  mapListings: MapListing[];
  children: ReactNode;
}) {
  const t = useTranslations('Maps');
  const [view, setView] = useState<View>('list');

  const chip =
    'inline-flex min-h-[44px] items-center rounded-full border-2 px-5 text-sm font-semibold transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label={t('viewLabel')}>
        <button
          type="button"
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
          className={`${chip} ${
            view === 'list'
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-brand-200 bg-white text-brand-700'
          }`}
        >
          <span aria-hidden="true">📋</span>&nbsp;{t('listView')}
        </button>
        <button
          type="button"
          aria-pressed={view === 'map'}
          onClick={() => setView('map')}
          className={`${chip} ${
            view === 'map'
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-brand-200 bg-white text-brand-700'
          }`}
        >
          <span aria-hidden="true">🗺️</span>&nbsp;{t('mapView')}
        </button>
      </div>
      {view === 'list' ? children : <NearMeMap listings={mapListings} />}
    </div>
  );
}
