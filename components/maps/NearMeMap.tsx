'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useRouter } from '@/i18n/routing';
import {
  GoogleMapsProvider,
  MapLoading,
  MapPlaceholder,
  useGoogleMaps,
} from './GoogleMapsProvider';

export type MapListing = {
  id: string;
  title: string;
  lat: number;
  lng: number;
};

// Edmonton, AB — the app's home base; replaced by geolocation when granted.
const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 };

const MAP_CONTAINER = { width: '100%', height: '420px' };

function NearMeMapInner({ listings }: { listings: MapListing[] }) {
  const t = useTranslations('Maps');
  const router = useRouter();
  const { isLoaded, hasKey } = useGoogleMaps();
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const useMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError(t('locationError'));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? t('locationDenied')
            : t('locationError')
        );
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, [t]);

  if (!hasKey) return <MapPlaceholder />;
  if (!isLoaded) return <MapLoading />;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-3xl border-2 border-brand-100">
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER}
          center={center}
          zoom={listings.length > 0 ? 11 : 10}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          }}
        >
          {listings.map((listing) => (
            <Marker
              key={listing.id}
              position={{ lat: listing.lat, lng: listing.lng }}
              title={listing.title}
              onClick={() => router.push(`/listings/${listing.id}`)}
            />
          ))}
        </GoogleMap>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          <span aria-hidden="true">📍</span>
          {locating ? t('locating') : t('useMyLocation')}
        </button>
        {listings.length === 0 ? (
          <p className="text-sm text-brand-700">{t('noPinnedListings')}</p>
        ) : null}
      </div>
      {geoError ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {geoError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Map view of provider listings. Each pin navigates to the listing's detail
 * page on click. Listings without coordinates are skipped by the caller.
 */
export function NearMeMap({ listings }: { listings: MapListing[] }) {
  return (
    <GoogleMapsProvider>
      <NearMeMapInner listings={listings} />
    </GoogleMapsProvider>
  );
}
