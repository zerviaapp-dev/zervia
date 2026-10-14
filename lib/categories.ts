/**
 * Marketplace service categories. Stable machine keys — user-facing labels
 * live in the `Categories` i18n namespace so all 10 languages stay in sync.
 */
export const categories = [
  'cleaning',
  'handyman',
  'plumbing',
  'electrical',
  'tutoring',
  'caregiving',
  'beauty',
  'massage',
  'fitness',
  'cooking',
  'tech',
  'moving',
  'yard',
  'errands',
  'other',
  // Renovation & trades (added Oct 2026)
  'drafting',
  'home_renovation',
  'basement_renovation',
  'cabinetry',
  'bathroom_renovation',
  'window_glass_cleaning',
  'led_lighting',
  'solar_install',
  'sealants',
  // Marketplace & rentals (added Oct 2026)
  'buy_sell',
  'room_rentals',
  'house_rent',
  'basement_suite',
  'apartment_condo',
  'locksmith',
  'flower_shop',
  // Digital services (added Oct 2026)
  'content_creator',
  'web_developer',
  'app_developer',
] as const;

export type Category = (typeof categories)[number];

export function isCategory(value: string): value is Category {
  return (categories as readonly string[]).includes(value);
}

/**
 * Logical display groups for the marketplace categories.
 * Machine keys are unchanged — this only controls grouped display order.
 * Labels live in the `CategoryGroups` i18n namespace (all 10 languages).
 * Categories are alphabetically sorted within each group.
 */
export interface CategoryGroup {
  key: 'home' | 'renovation' | 'personal' | 'family' | 'everyday' | 'digital' | 'marketplace' | 'rentals' | 'other';
  categories: readonly Category[];
}

export const categoryGroups: readonly CategoryGroup[] = [
  { key: 'home', categories: ['cleaning', 'electrical', 'handyman', 'moving', 'plumbing', 'window_glass_cleaning', 'yard'] },
  { key: 'renovation', categories: ['basement_renovation', 'bathroom_renovation', 'cabinetry', 'drafting', 'home_renovation', 'led_lighting', 'sealants', 'solar_install'] },
  { key: 'personal', categories: ['beauty', 'fitness', 'massage'] },
  { key: 'family', categories: ['caregiving', 'cooking', 'tutoring'] },
  { key: 'everyday', categories: ['errands', 'tech'] },
  { key: 'digital', categories: ['app_developer', 'content_creator', 'web_developer'] },
  { key: 'marketplace', categories: ['buy_sell'] },
  { key: 'rentals', categories: ['apartment_condo', 'basement_suite', 'house_rent', 'room_rentals'] },
  { key: 'other', categories: ['other'] },
];

/**
 * Detailed service types per category (5–8 each). Stable machine keys —
 * user-facing labels live in the `Subcategories` i18n namespace.
 * TODO: translate `Subcategories` labels beyond English (currently English
 * fallback in all 10 locale files).
 */
export const subcategories = {
  cleaning: [
    'house_cleaning',
    'deep_cleaning',
    'move_in_out_cleaning',
    'office_cleaning',
    'carpet_cleaning',
    'window_cleaning',
    'airbnb_turnover',
  ],
  handyman: [
    'furniture_assembly',
    'drywall_repair',
    'painting',
    'door_repair',
    'handyman_fixture_install',
    'tv_mounting',
    'minor_carpentry',
  ],
  plumbing: [
    'leak_repair',
    'drain_cleaning',
    'plumbing_fixture_install',
    'water_heater',
    'toilet_repair',
    'pipe_installation',
  ],
  electrical: [
    'lighting_installation',
    'outlet_switch_repair',
    'panel_upgrade',
    'ceiling_fan_install',
    'smoke_detector',
    'ev_charger_install',
  ],
  tutoring: [
    'math_tutoring',
    'science_tutoring',
    'english_tutoring',
    'test_prep',
    'music_lessons',
    'language_lessons',
    'computer_skills',
    'homework_help',
  ],
  caregiving: [
    'childcare',
    'elder_care',
    'special_needs_care',
    'pet_sitting',
    'companionship',
    'respite_care',
  ],
  beauty: [
    'haircut_styling',
    'manicure',
    'pedicure',
    'makeup',
    'facial',
    'hair_coloring',
    'waxing',
  ],
  massage: [
    'deep_tissue',
    'swedish_massage',
    'sports_massage',
    'prenatal_massage',
    'hot_stone',
  ],
  fitness: [
    'personal_training',
    'yoga',
    'pilates',
    'nutrition_coaching',
    'group_classes',
    'senior_fitness',
  ],
  cooking: [
    'personal_chef',
    'meal_prep',
    'catering',
    'baking',
    'cooking_classes',
    'holiday_meals',
  ],
  tech: [
    'computer_repair',
    'phone_repair',
    'smart_home_setup',
    'it_support',
    'wifi_networking',
    'data_recovery',
    'tv_setup',
  ],
  moving: [
    'local_moving',
    'long_distance_moving',
    'packing_services',
    'furniture_moving',
    'junk_removal',
    'storage_help',
  ],
  yard: [
    'lawn_mowing',
    'landscaping',
    'tree_trimming',
    'garden_design',
    'hedge_trimming',
    'pressure_washing',
  ],
  errands: [
    'grocery_shopping',
    'prescription_pickup',
    'dry_cleaning',
    'package_delivery',
    'pet_errands',
    'senior_errands',
  ],
  other: ['general_labor', 'event_help', 'custom_request'],
  // Renovation & trades
  drafting: [
    'architectural_drafting',
    'floor_plans',
    'permit_drawings',
    'as_built_drawings',
    'renovation_drawings',
    'structural_drawings',
  ],
  home_renovation: [
    'kitchen_remodel',
    'full_home_renovation',
    'home_addition',
    'flooring_renovation',
    'interior_painting_reno',
    'exterior_renovation',
  ],
  basement_renovation: [
    'basement_finishing',
    'basement_bathroom',
    'basement_legal_suite',
    'basement_waterproofing',
    'basement_flooring',
  ],
  cabinetry: [
    'kitchen_cabinets',
    'bathroom_vanity_cabinet',
    'custom_closets',
    'built_in_shelving',
    'cabinet_refacing',
    'pantry_cabinets',
  ],
  bathroom_renovation: [
    'full_bathroom_remodel',
    'shower_install',
    'tub_install',
    'bathroom_tile_work',
    'vanity_install',
    'bathroom_plumbing_rough_in',
  ],
  window_glass_cleaning: [
    'residential_window_cleaning',
    'commercial_window_cleaning',
    'glass_door_cleaning',
    'skylight_cleaning',
    'window_screen_cleaning',
  ],
  led_lighting: [
    'permanent_roofline_lighting',
    'landscape_led_lighting',
    'holiday_lighting_install',
    'led_retrofit',
    'smart_outdoor_lighting',
  ],
  solar_install: [
    'rooftop_solar_install',
    'solar_panel_repair',
    'solar_battery_storage',
    'solar_consultation',
    'off_grid_solar',
  ],
  sealants: [
    'window_caulking',
    'bathroom_sealant',
    'exterior_sealant',
    'concrete_sealing',
    'air_sealing',
  ],
  // Marketplace & rentals
  buy_sell: [
    'furniture_sale',
    'electronics_sale',
    'appliances_sale',
    'vehicles_sale',
    'clothing_sale',
    'baby_kids_items',
  ],
  room_rentals: [
    'private_room_rent',
    'shared_room_rent',
    'furnished_room_rent',
    'short_term_room',
  ],
  house_rent: [
    'detached_house_rent',
    'townhouse_rent',
    'duplex_rent',
  ],
  basement_suite: [
    'legal_basement_suite',
    'basement_studio_suite',
    'walkout_basement_suite',
  ],
  apartment_condo: [
    'apartment_rent',
    'condo_rent',
    'loft_rent',
  ],
  locksmith: [
    'emergency_lockout',
    'lock_replacement',
    'key_cutting',
    'lock_repair',
    'smart_lock_install',
    'rekeying',
  ],
  flower_shop: [
    'bouquets',
    'wedding_flowers',
    'funeral_flowers',
    'flower_delivery',
    'flower_subscriptions',
    'event_florals',
  ],
  // Digital services
  content_creator: [
    'video_editing',
    'social_media_content',
    'photography',
    'graphic_design',
    'copywriting',
    'podcast_production',
    'brand_content',
  ],
  web_developer: [
    'website_design',
    'website_development',
    'ecommerce_sites',
    'website_maintenance',
    'landing_pages',
    'seo_optimization',
    'web_app_development',
  ],
  app_developer: [
    'ios_app_development',
    'android_app_development',
    'cross_platform_apps',
    'app_ui_design',
    'app_maintenance',
    'app_prototyping',
  ],
} as const satisfies Record<Category, readonly string[]>;

export type Subcategory =
  (typeof subcategories)[Category][number];

export function isSubcategory(
  category: string,
  value: string
): value is Subcategory {
  if (!isCategory(category)) return false;
  return (subcategories[category] as readonly string[]).includes(value);
}

/** Listing price models. NULL price_cents always pairs with 'quote'. */
export const priceTypes = ['fixed', 'hourly', 'quote'] as const;

export type PriceType = (typeof priceTypes)[number];

export function isPriceType(value: string): value is PriceType {
  return (priceTypes as readonly string[]).includes(value);
}

/** Listing lifecycle states a provider may choose (admin-only: 'removed'). */
export const listingStatuses = ['draft', 'active', 'paused'] as const;

export type ListingStatus = (typeof listingStatuses)[number];

export function isListingStatus(value: string): value is ListingStatus {
  return (listingStatuses as readonly string[]).includes(value);
}
