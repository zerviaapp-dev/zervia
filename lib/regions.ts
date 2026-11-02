/**
 * Location / region model for the Zervia marketplace.
 *
 * Design: every city is divided into regions (e.g. Calgary's NE / NW / SE /
 * SW quadrants), each with its own neighborhoods. Services, providers, and
 * leads are tagged to a region so every area sees its own local marketplace.
 *
 * Calgary is the launch model. New cities follow the same shape:
 * add an entry to `cities` with `regions`, each with `neighborhoods`.
 */

export interface Region {
  /** Machine key, e.g. 'ne' */
  key: string;
  /** Short label, e.g. 'NE' */
  label: string;
  /** Full label, e.g. 'Northeast Calgary' */
  name: string;
  /** Neighborhoods inside this region */
  neighborhoods: string[];
}

export interface City {
  key: string;
  name: string;
  province: string;
  country: string; // ISO-3166 alpha-2
  center: { lat: number; lng: number };
  regions: Region[];
}

export const calgary: City = {
  key: 'calgary',
  name: 'Calgary',
  province: 'Alberta',
  country: 'CA',
  center: { lat: 51.0447, lng: -114.0719 },
  regions: [
    {
      key: 'ne',
      label: 'NE',
      name: 'Northeast Calgary',
      neighborhoods: [
        'Martindale',
        'Taradale',
        'Saddle Ridge',
        'Falconridge',
        'Castleridge',
        'Coral Springs',
        'Monterey Park',
        'Pineridge',
        'Rundle',
        'Whitehorn',
        'Temple',
        'Marlborough',
        'Abbeydale',
        'Applewood Park',
        'Penbrooke Meadows',
        'Redstone',
        'Skyview Ranch',
        'Cityscape',
        'Cornerstone',
      ],
    },
    {
      key: 'nw',
      label: 'NW',
      name: 'Northwest Calgary',
      neighborhoods: [
        'Arbour Lake',
        'Citadel',
        'Hawkwood',
        'Ranchlands',
        'Silver Springs',
        'Varsity',
        'Brentwood',
        'Dalhousie',
        'Edgemont',
        'Hamptons',
        'Nolan Hill',
        'Sherwood',
        'Kincora',
        'Evanston',
        'Creekside',
        'Tuscany',
        'Royal Oak',
        'Rocky Ridge',
        'Crowfoot',
        'Bowness',
        'Montgomery',
        'University District',
      ],
    },
    {
      key: 'se',
      label: 'SE',
      name: 'Southeast Calgary',
      neighborhoods: [
        'New Brighton',
        'Copperfield',
        'Mahogany',
        'Auburn Bay',
        'Seton',
        'Cranston',
        'Walden',
        'Legacy',
        'Aspen Woods',
        'West Springs',
        'Signal Hill',
        'Strathcona',
        'Glamorgan',
        'Glenbrook',
        'Killamey',
        'Inglewood',
        'Ramsay',
        'Bridgeland',
        'Forest Lawn',
        'Dover',
        'Erin Woods',
        'Mckenzie Towne',
        'Mckenzie Lake',
        'Douglasdale',
        'Quarry Park',
        'Riverbend',
        'Ogden',
      ],
    },
    {
      key: 'sw',
      label: 'SW',
      name: 'Southwest Calgary',
      neighborhoods: [
        'Evergreen',
        'Shawnessy',
        'Millrise',
        'Somerset',
        'Silverado',
        'Chaparral',
        'Sundance',
        'Midnapore',
        'Fish Creek',
        'Oakridge',
        'Cedarbrae',
        'Braeside',
        'Southwood',
        'Haysboro',
        'Acadia',
        'Fairview',
        'Kingsland',
        'Elbow Park',
        'Mission',
        'Cliff Bungalow',
        'Bankview',
        'Altadore',
        'Garrison Woods',
        'Marda Loop',
      ],
    },
    {
      key: 'central',
      label: 'Central',
      name: 'Central Calgary',
      neighborhoods: [
        'Downtown',
        'Beltline',
        'Eau Claire',
        'Chinatown',
        'East Village',
        'Victoria Park',
        'Sunalta',
        'Scarboro',
        'Upper Mount Royal',
        'Lower Mount Royal',
        'Connaught',
      ],
    },
  ],
};

/** All launch cities. Calgary first; append more cities with the same shape. */
export const cities: City[] = [calgary];

export function getCity(key: string): City | undefined {
  return cities.find((c) => c.key === key);
}

export function getRegion(cityKey: string, regionKey: string): Region | undefined {
  return getCity(cityKey)?.regions.find((r) => r.key === regionKey);
}

/** All neighborhoods of a city, flattened (for search suggestions). */
export function cityNeighborhoods(cityKey: string): string[] {
  return getCity(cityKey)?.regions.flatMap((r) => r.neighborhoods) ?? [];
}

/** Find which region a neighborhood belongs to (case-insensitive). */
export function regionForNeighborhood(
  cityKey: string,
  neighborhood: string,
): Region | undefined {
  const needle = neighborhood.trim().toLowerCase();
  return getCity(cityKey)?.regions.find((r) =>
    r.neighborhoods.some((n) => n.toLowerCase() === needle),
  );
}

/**
 * Lead-generation targets per region — used by the growth dashboard to track
 * provider/customer lead coverage. Liz's targets: 500 leads in Calgary alone,
 * scaling to 1,000,000+ across cities and provinces.
 */
export const LEAD_TARGETS = {
  calgaryTotal: 500,
  perRegion: {
    ne: 110,
    nw: 110,
    se: 140,
    sw: 100,
    central: 40,
  } as Record<string, number>,
  global: 1_000_000,
} as const;
