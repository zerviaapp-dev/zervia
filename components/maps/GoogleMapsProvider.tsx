'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { useTranslations } from 'next-intl';

type GoogleMapsContextValue = {
  /** True once the Maps JS API script has finished loading. */
  isLoaded: boolean;
  /** False when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured. */
  hasKey: boolean;
};

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  isLoaded: false,
  hasKey: false,
});

/** Access the Maps loader state inside a `GoogleMapsProvider` tree. */
export function useGoogleMaps(): GoogleMapsContextValue {
  return useContext(GoogleMapsContext);
}

// No extra libraries needed — maps + markers only. Kept as a module-level
// constant so useJsApiLoader never sees a changed reference.
const MAP_LIBRARIES: (
  | 'places'
  | 'drawing'
  | 'geometry'
  | 'visualization'
)[] = [];

function LoadedMapsProvider({
  apiKey,
  children,
}: {
  apiKey: string;
  children: ReactNode;
}) {
  const { isLoaded } = useJsApiLoader({
    id: 'zervia-google-maps',
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES,
  });
  return (
    <GoogleMapsContext.Provider value={{ isLoaded, hasKey: true }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Loads the Google Maps JS API once per component tree (the loader dedupes
 * by script id, so several providers on one page share one script tag).
 *
 * When `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing, children still render —
 * map components read `hasKey` and show `MapPlaceholder` instead.
 */
export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, hasKey: false }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }
  return <LoadedMapsProvider apiKey={apiKey}>{children}</LoadedMapsProvider>;
}

/** Graceful placeholder rendered when the Maps API key is missing. */
export function MapPlaceholder({ className = '' }: { className?: string }) {
  const t = useTranslations('Maps');
  return (
    <div
      className={`flex min-h-[280px] w-full items-center justify-center rounded-2xl bg-brand-50 p-6 text-center ${className}`}
    >
      <div>
        <div className="text-4xl" aria-hidden="true">
          🗺️
        </div>
        <p className="mt-2 text-sm font-semibold text-brand-700">
          {t('unavailable')}
        </p>
      </div>
    </div>
  );
}

/** Loading skeleton rendered while the Maps script is being fetched. */
export function MapLoading({ className = '' }: { className?: string }) {
  const t = useTranslations('Maps');
  return (
    <div
      className={`flex min-h-[280px] w-full animate-pulse items-center justify-center rounded-2xl bg-brand-100 p-6 ${className}`}
      aria-busy="true"
    >
      <p className="text-sm font-medium text-brand-600">{t('loading')}</p>
    </div>
  );
}
