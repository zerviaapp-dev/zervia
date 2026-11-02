/**
 * Marketplace showcase metadata for the 15 service categories:
 * photo, tagline, starting price, and popular services.
 *
 * Photos live in `public/images/categories/<key>.jpg` (real service photos).
 * Taglines/prices are display defaults; per-locale taglines can be added to
 * the `Services` i18n namespace later (English ships first).
 */
import type { Category } from './categories';

export interface CategoryShowcase {
  key: Category;
  /** Public path to the category photo */
  photo: string;
  /** One-line hook shown on the card */
  tagline: string;
  /** Starting amount on its own, e.g. '$25'. For quote-based categories
   * this is a full phrase instead ('Consultations vary') and unit is ''. */
  fromPrice: string;
  /**
   * Explicit price unit appended to fromPrice at render time:
   * '/hr' for services conventionally sold by the hour, '/mo' for
   * rentals, and '' for per-job / per-project / per-item prices and
   * quote-based categories, where any unit would be a false claim.
   * (Fix Oct 23, 2026: previously the i18n template hardcoded '/hr'
   * for every category, producing "$400/mo/hr" and "$1/hr".)
   */
  unit: '/hr' | '/mo' | '';
  /** 3 popular services shown on the category page */
  popular: string[];
  /** Accent gradient for card overlays */
  gradient: string;
}

export const categoryShowcase: Record<Category, CategoryShowcase> = {
  cleaning: {
    key: 'cleaning',
    photo: '/images/categories/cleaning.jpg',
    tagline: 'Sparkling homes, zero effort',
    fromPrice: '$25',
    unit: '/hr',
    popular: ['House cleaning', 'Deep cleaning', 'Move-in/out cleaning'],
    gradient: 'from-sky-500/80 to-blue-700/80',
  },
  handyman: {
    key: 'handyman',
    photo: '/images/categories/handyman.jpg',
    tagline: 'Every fix, done right',
    fromPrice: '$30',
    unit: '/hr',
    popular: ['Furniture assembly', 'Drywall repair', 'Painting'],
    gradient: 'from-amber-500/80 to-orange-700/80',
  },
  plumbing: {
    key: 'plumbing',
    photo: '/images/categories/plumbing.jpg',
    tagline: 'Leaks fixed fast',
    fromPrice: '$49',
    unit: '',
    popular: ['Leak repair', 'Drain cleaning', 'Fixture install'],
    gradient: 'from-cyan-500/80 to-sky-700/80',
  },
  electrical: {
    key: 'electrical',
    photo: '/images/categories/electrical.jpg',
    tagline: 'Safe, certified electricians',
    fromPrice: '$49',
    unit: '',
    popular: ['Lighting install', 'Panel upgrade', 'EV charger install'],
    gradient: 'from-yellow-500/80 to-amber-700/80',
  },
  tutoring: {
    key: 'tutoring',
    photo: '/images/categories/tutoring.jpg',
    tagline: 'Better grades, guaranteed effort',
    fromPrice: '$20',
    unit: '/hr',
    popular: ['Math tutoring', 'Test prep', 'Language lessons'],
    gradient: 'from-violet-500/80 to-purple-700/80',
  },
  caregiving: {
    key: 'caregiving',
    photo: '/images/categories/caregiving.jpg',
    tagline: 'Care you can trust',
    fromPrice: '$22',
    unit: '/hr',
    popular: ['Childcare', 'Senior care', 'Pet sitting'],
    gradient: 'from-rose-500/80 to-pink-700/80',
  },
  beauty: {
    key: 'beauty',
    photo: '/images/categories/beauty.jpg',
    tagline: 'Salon looks at home',
    fromPrice: '$30',
    unit: '',
    popular: ['Haircut & styling', 'Manicure', 'Makeup'],
    gradient: 'from-fuchsia-500/80 to-pink-700/80',
  },
  massage: {
    key: 'massage',
    photo: '/images/categories/massage.jpg',
    tagline: 'Relaxation delivered',
    fromPrice: '$60',
    unit: '/hr',
    popular: ['Deep tissue', 'Hot stone', 'Swedish massage'],
    gradient: 'from-teal-500/80 to-emerald-700/80',
  },
  fitness: {
    key: 'fitness',
    photo: '/images/categories/fitness.jpg',
    tagline: 'Your goals, coached',
    fromPrice: '$35',
    unit: '/hr',
    popular: ['Personal training', 'Yoga', 'Nutrition coaching'],
    gradient: 'from-lime-500/80 to-green-700/80',
  },
  cooking: {
    key: 'cooking',
    photo: '/images/categories/cooking.jpg',
    tagline: 'Chef-made meals at home',
    fromPrice: '$40',
    unit: '',
    popular: ['Personal chef', 'Meal prep', 'Catering'],
    gradient: 'from-orange-500/80 to-red-700/80',
  },
  tech: {
    key: 'tech',
    photo: '/images/categories/tech.jpg',
    tagline: 'Tech headaches, solved',
    fromPrice: '$30',
    unit: '',
    popular: ['Computer repair', 'WiFi setup', 'TV mounting'],
    gradient: 'from-indigo-500/80 to-blue-700/80',
  },
  moving: {
    key: 'moving',
    photo: '/images/categories/moving.jpg',
    tagline: 'Move without the stress',
    fromPrice: '$60',
    unit: '',
    popular: ['Local movers', 'Furniture delivery', 'Junk hauling'],
    gradient: 'from-stone-500/80 to-stone-700/80',
  },
  yard: {
    key: 'yard',
    photo: '/images/categories/yard.jpg',
    tagline: 'A yard you love',
    fromPrice: '$25',
    unit: '',
    popular: ['Lawn mowing', 'Landscaping', 'Snow removal'],
    gradient: 'from-green-500/80 to-emerald-700/80',
  },
  errands: {
    key: 'errands',
    photo: '/images/categories/errands.jpg',
    tagline: 'Your to-do list, done',
    fromPrice: '$15',
    unit: '',
    popular: ['Grocery runs', 'Package pickup', 'Airport rides'],
    gradient: 'from-blue-500/80 to-indigo-700/80',
  },
  other: {
    key: 'other',
    photo: '/images/categories/other.jpg',
    tagline: "Anything else? Just ask",
    fromPrice: '$20',
    unit: '',
    popular: ['Custom requests', 'Event help', 'Odd jobs'],
    gradient: 'from-slate-500/80 to-slate-700/80',
  },
  // Renovation & trades
  drafting: {
    key: 'drafting',
    photo: '/images/categories/drafting.jpg',
    tagline: 'Plans drawn to perfection',
    fromPrice: '$99',
    unit: '',
    popular: ['Floor plans', 'Permit drawings', 'As-built drawings'],
    gradient: 'from-slate-600/80 to-slate-800/80',
  },
  home_renovation: {
    key: 'home_renovation',
    photo: '/images/categories/home_renovation.jpg',
    tagline: 'Transform your whole home',
    fromPrice: '$499',
    unit: '',
    popular: ['Kitchen remodel', 'Full home renovation', 'Home additions'],
    gradient: 'from-orange-600/80 to-amber-800/80',
  },
  basement_renovation: {
    key: 'basement_renovation',
    photo: '/images/categories/basement_renovation.jpg',
    tagline: 'Unlock your lower level',
    fromPrice: '$399',
    unit: '',
    popular: ['Basement finishing', 'Legal suites', 'Waterproofing'],
    gradient: 'from-stone-600/80 to-stone-800/80',
  },
  cabinetry: {
    key: 'cabinetry',
    photo: '/images/categories/cabinetry.jpg',
    tagline: 'Custom cabinets, crafted',
    fromPrice: '$149',
    unit: '',
    popular: ['Kitchen cabinets', 'Custom closets', 'Built-ins'],
    gradient: 'from-amber-600/80 to-yellow-800/80',
  },
  bathroom_renovation: {
    key: 'bathroom_renovation',
    photo: '/images/categories/bathroom_renovation.jpg',
    tagline: 'Your dream bathroom',
    fromPrice: '$299',
    unit: '',
    popular: ['Full remodel', 'Shower install', 'Tile work'],
    gradient: 'from-cyan-600/80 to-blue-800/80',
  },
  window_glass_cleaning: {
    key: 'window_glass_cleaning',
    photo: '/images/categories/window_glass_cleaning.jpg',
    tagline: 'Crystal-clear views',
    fromPrice: '$29',
    unit: '',
    popular: ['Residential windows', 'Commercial glass', 'Skylights'],
    gradient: 'from-sky-400/80 to-cyan-700/80',
  },
  led_lighting: {
    key: 'led_lighting',
    photo: '/images/categories/led_lighting.jpg',
    tagline: 'Permanent LED magic',
    fromPrice: '$199',
    unit: '',
    popular: ['Roofline lighting', 'Landscape LED', 'Holiday install'],
    gradient: 'from-violet-600/80 to-indigo-800/80',
  },
  solar_install: {
    key: 'solar_install',
    photo: '/images/categories/solar_install.jpg',
    tagline: 'Power your home with sun',
    fromPrice: '$999',
    unit: '',
    popular: ['Rooftop solar', 'Battery storage', 'Consultations'],
    gradient: 'from-yellow-500/80 to-orange-700/80',
  },
  sealants: {
    key: 'sealants',
    photo: '/images/categories/sealants.jpg',
    tagline: 'Sealed tight, done right',
    fromPrice: '$39',
    unit: '',
    popular: ['Window caulking', 'Bathroom sealant', 'Concrete sealing'],
    gradient: 'from-teal-600/80 to-cyan-800/80',
  },
  // Marketplace & rentals
  buy_sell: {
    key: 'buy_sell',
    photo: '/images/categories/buy_sell.jpg',
    tagline: 'Buy & sell safely',
    // No platform-stated starting price (fix Z3/Z4, Oct 23, 2026):
    // items are priced per listing by their sellers, so the old
    // "from $1" was a false claim. Quote-style wording instead,
    // shown without a "from" prefix like the other quote-based
    // categories (legal_services, insurance, mortgage_brokerage).
    fromPrice: 'Request quote',
    unit: '',
    popular: ['Furniture', 'Electronics', 'Appliances'],
    gradient: 'from-emerald-600/80 to-green-800/80',
  },
  room_rentals: {
    key: 'room_rentals',
    photo: '/images/categories/room_rentals.jpg',
    tagline: 'Find your room',
    fromPrice: '$400',
    unit: '/mo',
    popular: ['Private rooms', 'Furnished rooms', 'Short-term'],
    gradient: 'from-blue-600/80 to-indigo-800/80',
  },
  house_rent: {
    key: 'house_rent',
    photo: '/images/categories/house_rent.jpg',
    tagline: 'Houses for rent',
    fromPrice: '$1200',
    unit: '/mo',
    popular: ['Detached homes', 'Townhouses', 'Duplexes'],
    gradient: 'from-rose-600/80 to-red-800/80',
  },
  basement_suite: {
    key: 'basement_suite',
    photo: '/images/categories/basement_suite.jpg',
    tagline: 'Cozy basement suites',
    fromPrice: '$800',
    unit: '/mo',
    popular: ['Legal suites', 'Studios', 'Walkouts'],
    gradient: 'from-purple-600/80 to-violet-800/80',
  },
  apartment_condo: {
    key: 'apartment_condo',
    photo: '/images/categories/apartment_condo.jpg',
    tagline: 'Apartments & condos',
    fromPrice: '$1000',
    unit: '/mo',
    popular: ['Apartments', 'Condos', 'Lofts'],
    gradient: 'from-indigo-600/80 to-blue-800/80',
  },
  locksmith: {
    key: 'locksmith',
    photo: '/images/categories/locksmith.jpg',
    tagline: 'Locks, keys & security',
    fromPrice: '$75',
    unit: '',
    popular: ['Emergency lockout', 'Lock replacement', 'Smart locks'],
    gradient: 'from-slate-600/80 to-gray-800/80',
  },
  flower_shop: {
    key: 'flower_shop',
    photo: '/images/categories/flower_shop.jpg',
    tagline: 'Fresh flowers & arrangements',
    fromPrice: '$30',
    unit: '',
    popular: ['Bouquets', 'Wedding flowers', 'Flower delivery'],
    gradient: 'from-pink-500/80 to-rose-700/80',
  },
  content_creator: {
    key: 'content_creator',
    photo: '/images/categories/content_creator.jpg',
    tagline: 'Videos, photos & content that converts',
    fromPrice: '$50',
    unit: '',
    popular: ['Video editing', 'Social media content', 'Photography'],
    gradient: 'from-violet-500/80 to-purple-700/80',
  },
  web_developer: {
    key: 'web_developer',
    photo: '/images/categories/web_developer.jpg',
    tagline: 'Websites built to grow your business',
    fromPrice: '$500',
    unit: '',
    popular: ['Website design', 'E-commerce sites', 'Landing pages'],
    gradient: 'from-indigo-500/80 to-blue-700/80',
  },
  app_developer: {
    key: 'app_developer',
    photo: '/images/categories/app_developer.jpg',
    tagline: 'Mobile apps, iOS & Android',
    fromPrice: '$1,000',
    unit: '',
    popular: ['iOS apps', 'Android apps', 'Cross-platform apps'],
    gradient: 'from-teal-500/80 to-emerald-700/80',
  },
  legal_services: {
    key: 'legal_services',
    photo: '/images/categories/legal_services.jpg',
    tagline: 'Licensed lawyers, direct',
    // No platform-stated price for legal work (audit Appendix A):
    // consultations and fees are set by the lawyer, on their own site.
    fromPrice: 'Consultations vary',
    unit: '',
    popular: ['Business law', 'Family law', 'Real estate law'],
    gradient: 'from-slate-600/80 to-slate-900/80',
  },
  insurance: {
    key: 'insurance',
    photo: '/images/categories/insurance.jpg',
    tagline: 'Licensed insurance brokers & agents, direct',
    // No platform-stated price: premiums are quoted by the licensed
    // provider/insurer on their own site.
    fromPrice: 'Quotes vary',
    unit: '',
    popular: ['Home insurance', 'Auto insurance', 'Life insurance'],
    gradient: 'from-emerald-600/80 to-teal-900/80',
  },
  mortgage_brokerage: {
    key: 'mortgage_brokerage',
    photo: '/images/categories/mortgage_brokerage.jpg',
    tagline: 'Licensed mortgage brokers, direct',
    // No platform-stated price/rates: rates are set by lenders and
    // quoted by the broker on their own site.
    fromPrice: 'Rates vary',
    unit: '',
    popular: ['Pre-approval', 'Refinance', 'Renewal'],
    gradient: 'from-sky-600/80 to-blue-900/80',
  },
};

/** True when the category carries a real starting amount ('$…'),
 * as opposed to a quote-based phrase ('Consultations vary'). */
export function categoryIsPriced(meta: CategoryShowcase): boolean {
  return meta.fromPrice.startsWith('$');
}

/** Starting-price value for renderers: amount + its explicit unit,
 * e.g. '$25/hr', '$400/mo'. Quote-based categories (including
 * buy_sell's 'Request quote') return their phrase unchanged and
 * must be shown without a "from" prefix. */
export function categoryFromPriceValue(meta: CategoryShowcase): string {
  return `${meta.fromPrice}${meta.unit}`;
}

/** Ordered keys for showcase grids (most-demanded first). */
export const showcaseOrder: Category[] = [
  'cleaning',
  'handyman',
  'plumbing',
  'electrical',
  'home_renovation',
  'moving',
  'yard',
  'beauty',
  'massage',
  'tutoring',
  'caregiving',
  'cooking',
  'tech',
  'fitness',
  'buy_sell',
  'room_rentals',
  'house_rent',
  'cabinetry',
  'bathroom_renovation',
  'basement_renovation',
  'solar_install',
  'drafting',
  'window_glass_cleaning',
  'led_lighting',
  'sealants',
  'basement_suite',
  'apartment_condo',
  'errands',
  'other',
];
