'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { GoogleMap, Marker } from '@react-google-maps/api';
import {
  GoogleMapsProvider,
  MapLoading,
  MapPlaceholder,
  useGoogleMaps,
} from './GoogleMapsProvider';

export type MapCoords = { lat: number; lng: number };

// Edmonton, AB — the app's home base; only used before a pin is dropped.
const DEFAULT_CENTER: MapCoords = { lat: 53.5461, lng: -113.4938 };

const MAP_CONTAINER = { width: '100%', height: '300px' };

type LocationPickerMapProps = {
  value: MapCoords | null;
  onChange: (value: MapCoords | null) => void;
};

function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const t = useTranslations('Maps');
  const { isLoaded, hasKey } = useGoogleMaps();

  const placePin = useCallback(
    (lat: number, lng: number) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      // 6 decimals ≈ 11 cm — plenty for a service-area pin.
      onChange({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      });
    },
    [onChange]
  );

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat != null && lng != null) placePin(lat, lng);
    },
    [placePin]
  );

  const handleDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat != null && lng != null) placePin(lat, lng);
    },
    [placePin]
  );

  if (!hasKey) return <MapPlaceholder />;
  if (!isLoaded) return <MapLoading />;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border-2 border-brand-100">
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER}
          center={value ?? DEFAULT_CENTER}
          zoom={value ? 14 : 10}
          onClick={handleMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          }}
        >
          {value ? (
            <Marker
              position={value}
              draggable
              onDragEnd={handleDragEnd}
              title={`${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`}
            />
          ) : null}
        </GoogleMap>
      </div>
      <p className="text-xs text-brand-600" aria-live="polite">
        {t('coordsLabel')}:{' '}
        {value
          ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
          : t('noCoords')}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-brand-500">{t('pickerHint')}</p>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-semibold text-brand-600 underline hover:text-brand-700"
          >
            {t('clearLocation')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Interactive map for picking a listing's coordinates: tap/click the map to
 * drop a pin, or drag the pin to fine-tune. Renders its own
 * `GoogleMapsProvider`, so it can be dropped into any form.
 */
export function LocationPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: MapCoords | null;
  onChange: (value: MapCoords | null) => void;
}) {
  return (
    <GoogleMapsProvider>
      <div id={id}>
        <LocationPickerMap value={value} onChange={onChange} />
      </div>
    </GoogleMapsProvider>
  );
}
