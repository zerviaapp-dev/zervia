/**
 * Google Places API (New) helpers — SERVER-SIDE ONLY.
 *
 * The API key lives in the `GOOGLE_PLACES_API_KEY` environment variable and
 * must never be exposed to the client. Every function in this module fails
 * gracefully (returns null / []) when the key is missing or Google errors,
 * so callers can degrade to "import not available" UI instead of crashing.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1';

export type GooglePlaceMatch = {
  placeId: string;
  name: string;
  address: string | null;
};

export type GoogleReview = {
  authorName: string;
  /** 1–5 star rating from Google. */
  rating: number;
  /** Review body text (may be empty for rating-only reviews). */
  text: string;
  /** ISO-8601 publish time reported by Google. */
  time: string;
  profilePhotoUrl?: string;
};

export type GooglePlaceDetails = {
  placeId: string;
  name: string;
  address: string | null;
  mapsUrl: string | null;
  reviews: GoogleReview[];
};

/** True when the Places API key is present (server only). */
export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

type TextSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
  }>;
};

type PlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  reviews?: Array<{
    name?: string;
    rating?: number;
    text?: { text?: string };
    publishTime?: string;
    relativePublishTimeDescription?: string;
    authorAttribution?: {
      displayName?: string;
      photoUri?: string;
      uri?: string;
    };
  }>;
};

function apiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY ?? null;
}

/**
 * Look up a business on Google via Text Search (New) and return the top
 * match's place ID, display name and formatted address.
 */
export async function findPlaceId(
  businessName: string,
  location?: string
): Promise<GooglePlaceMatch | null> {
  const key = apiKey();
  const query = businessName.trim();
  if (!key || !query) return null;

  let res: Response;
  try {
    res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: location?.trim() ? `${query}, ${location.trim()}` : query,
        maxResultCount: 5,
        languageCode: 'en',
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: TextSearchResponse;
  try {
    data = (await res.json()) as TextSearchResponse;
  } catch {
    return null;
  }
  const place = data.places?.[0];
  if (!place?.id) return null;
  return {
    placeId: place.id,
    name: place.displayName?.text?.trim() || query,
    address: place.formattedAddress?.trim() || null,
  };
}

/** Fetch full details (incl. up to 5 reviews) for one place. */
export async function fetchPlaceDetails(
  placeId: string
): Promise<GooglePlaceDetails | null> {
  const key = apiKey();
  if (!key || !placeId.trim()) return null;

  let res: Response;
  try {
    res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId.trim())}`, {
      headers: {
        'X-Goog-Api-Key': key,
        // reviews are returned in Google's default (most-relevant) order.
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,googleMapsUri,reviews',
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: PlaceDetailsResponse;
  try {
    data = (await res.json()) as PlaceDetailsResponse;
  } catch {
    return null;
  }

  const reviews: GoogleReview[] = (data.reviews ?? [])
    .slice(0, 5)
    .map((r) => ({
      authorName: r.authorAttribution?.displayName?.trim() || 'Google user',
      rating:
        typeof r.rating === 'number'
          ? Math.min(5, Math.max(1, Math.round(r.rating)))
          : 5,
      text: r.text?.text?.trim() ?? '',
      time: r.publishTime ?? new Date().toISOString(),
      ...(r.authorAttribution?.photoUri
        ? { profilePhotoUrl: r.authorAttribution.photoUri }
        : {}),
    }));

  return {
    placeId: data.id ?? placeId,
    name: data.displayName?.text?.trim() ?? '',
    address: data.formattedAddress?.trim() ?? null,
    mapsUrl: data.googleMapsUri ?? null,
    reviews,
  };
}

/**
 * Fetch up to 5 Google reviews for a place, in Google's default
 * (most-relevant) order. Returns [] when unconfigured or on any error.
 */
export async function fetchGoogleReviews(placeId: string): Promise<GoogleReview[]> {
  const details = await fetchPlaceDetails(placeId);
  return details?.reviews ?? [];
}
