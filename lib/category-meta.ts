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
  /** Display starting price (already localized per currency at render time) */
  fromPrice: string;
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
    popular: ['House cleaning', 'Deep cleaning', 'Move-in/out cleaning'],
    gradient: 'from-sky-500/80 to-blue-700/80',
  },
  handyman: {
    key: 'handyman',
    photo: '/images/categories/handyman.jpg',
    tagline: 'Every fix, done right',
    fromPrice: '$30',
    popular: ['Furniture assembly', 'Drywall repair', 'Painting'],
    gradient: 'from-amber-500/80 to-orange-700/80',
  },
  plumbing: {
    key: 'plumbing',
    photo: '/images/categories/plumbing.jpg',
    tagline: 'Leaks fixed fast',
    fromPrice: '$49',
    popular: ['Leak repair', 'Drain cleaning', 'Fixture install'],
    gradient: 'from-cyan-500/80 to-sky-700/80',
  },
  electrical: {
    key: 'electrical',
    photo: '/images/categories/electrical.jpg',
    tagline: 'Safe, certified electricians',
    fromPrice: '$49',
    popular: ['Lighting install', 'Panel upgrade', 'EV charger install'],
    gradient: 'from-yellow-500/80 to-amber-700/80',
  },
  tutoring: {
    key: 'tutoring',
    photo: '/images/categories/tutoring.jpg',
    tagline: 'Better grades, guaranteed effort',
    fromPrice: '$20',
    popular: ['Math tutoring', 'Test prep', 'Language lessons'],
    gradient: 'from-violet-500/80 to-purple-700/80',
  },
  caregiving: {
    key: 'caregiving',
    photo: '/images/categories/caregiving.jpg',
    tagline: 'Care you can trust',
    fromPrice: '$22',
    popular: ['Childcare', 'Senior care', 'Pet sitting'],
    gradient: 'from-rose-500/80 to-pink-700/80',
  },
  beauty: {
    key: 'beauty',
    photo: '/images/categories/beauty.jpg',
    tagline: 'Salon looks at home',
    fromPrice: '$30',
    popular: ['Haircut & styling', 'Manicure', 'Makeup'],
    gradient: 'from-fuchsia-500/80 to-pink-700/80',
  },
  massage: {
    key: 'massage',
    photo: '/images/categories/massage.jpg',
    tagline: 'Relaxation delivered',
    fromPrice: '$60',
    popular: ['Deep tissue', 'Hot stone', 'Swedish massage'],
    gradient: 'from-teal-500/80 to-emerald-700/80',
  },
  fitness: {
    key: 'fitness',
    photo: '/images/categories/fitness.jpg',
    tagline: 'Your goals, coached',
    fromPrice: '$35',
    popular: ['Personal training', 'Yoga', 'Nutrition coaching'],
    gradient: 'from-lime-500/80 to-green-700/80',
  },
  cooking: {
    key: 'cooking',
    photo: '/images/categories/cooking.jpg',
    tagline: 'Chef-made meals at home',
    fromPrice: '$40',
    popular: ['Personal chef', 'Meal prep', 'Catering'],
    gradient: 'from-orange-500/80 to-red-700/80',
  },
  tech: {
    key: 'tech',
    photo: '/images/categories/tech.jpg',
    tagline: 'Tech headaches, solved',
    fromPrice: '$30',
    popular: ['Computer repair', 'WiFi setup', 'TV mounting'],
    gradient: 'from-indigo-500/80 to-blue-700/80',
  },
  moving: {
    key: 'moving',
    photo: '/images/categories/moving.jpg',
    tagline: 'Move without the stress',
    fromPrice: '$60',
    popular: ['Local movers', 'Furniture delivery', 'Junk hauling'],
    gradient: 'from-stone-500/80 to-stone-700/80',
  },
  yard: {
    key: 'yard',
    photo: '/images/categories/yard.jpg',
    tagline: 'A yard you love',
    fromPrice: '$25',
    popular: ['Lawn mowing', 'Landscaping', 'Snow removal'],
    gradient: 'from-green-500/80 to-emerald-700/80',
  },
  errands: {
    key: 'errands',
    photo: '/images/categories/errands.jpg',
    tagline: 'Your to-do list, done',
    fromPrice: '$15',
    popular: ['Grocery runs', 'Package pickup', 'Airport rides'],
    gradient: 'from-blue-500/80 to-indigo-700/80',
  },
  other: {
    key: 'other',
    photo: '/images/categories/other.jpg',
    tagline: "Anything else? Just ask",
    fromPrice: '$20',
    popular: ['Custom requests', 'Event help', 'Odd jobs'],
    gradient: 'from-slate-500/80 to-slate-700/80',
  },
  // Renovation & trades
  drafting: {
    key: 'drafting',
    photo: '/images/categories/drafting.jpg',
    tagline: 'Plans drawn to perfection',
    fromPrice: '$99',
    popular: ['Floor plans', 'Permit drawings', 'As-built drawings'],
    gradient: 'from-slate-600/80 to-slate-800/80',
  },
  home_renovation: {
    key: 'home_renovation',
    photo: '/images/categories/home_renovation.jpg',
    tagline: 'Transform your whole home',
    fromPrice: '$499',
    popular: ['Kitchen remodel', 'Full home renovation', 'Home additions'],
    gradient: 'from-orange-600/80 to-amber-800/80',
  },
  basement_renovation: {
    key: 'basement_renovation',
    photo: '/images/categories/basement_renovation.jpg',
    tagline: 'Unlock your lower level',
    fromPrice: '$399',
    popular: ['Basement finishing', 'Legal suites', 'Waterproofing'],
    gradient: 'from-stone-600/80 to-stone-800/80',
  },
  cabinetry: {
    key: 'cabinetry',
    photo: '/images/categories/cabinetry.jpg',
    tagline: 'Custom cabinets, crafted',
    fromPrice: '$149',
    popular: ['Kitchen cabinets', 'Custom closets', 'Built-ins'],
    gradient: 'from-amber-600/80 to-yellow-800/80',
  },
  bathroom_renovation: {
    key: 'bathroom_renovation',
    photo: '/images/categories/bathroom_renovation.jpg',
    tagline: 'Your dream bathroom',
    fromPrice: '$299',
    popular: ['Full remodel', 'Shower install', 'Tile work'],
    gradient: 'from-cyan-600/80 to-blue-800/80',
  },
  window_glass_cleaning: {
    key: 'window_glass_cleaning',
    photo: '/images/categories/window_glass_cleaning.jpg',
    tagline: 'Crystal-clear views',
    fromPrice: '$29',
    popular: ['Residential windows', 'Commercial glass', 'Skylights'],
    gradient: 'from-sky-400/80 to-cyan-700/80',
  },
  led_lighting: {
    key: 'led_lighting',
    photo: '/images/categories/led_lighting.jpg',
    tagline: 'Permanent LED magic',
    fromPrice: '$199',
    popular: ['Roofline lighting', 'Landscape LED', 'Holiday install'],
    gradient: 'from-violet-600/80 to-indigo-800/80',
  },
  solar_install: {
    key: 'solar_install',
    photo: '/images/categories/solar_install.jpg',
    tagline: 'Power your home with sun',
    fromPrice: '$999',
    popular: ['Rooftop solar', 'Battery storage', 'Consultations'],
    gradient: 'from-yellow-500/80 to-orange-700/80',
  },
  sealants: {
    key: 'sealants',
    photo: '/images/categories/sealants.jpg',
    tagline: 'Sealed tight, done right',
    fromPrice: '$39',
    popular: ['Window caulking', 'Bathroom sealant', 'Concrete sealing'],
    gradient: 'from-teal-600/80 to-cyan-800/80',
  },
  // Marketplace & rentals
  buy_sell: {
    key: 'buy_sell',
    photo: '/images/categories/buy_sell.jpg',
    tagline: 'Buy & sell safely',
    fromPrice: '$1',
    popular: ['Furniture', 'Electronics', 'Appliances'],
    gradient: 'from-emerald-600/80 to-green-800/80',
  },
  room_rentals: {
    key: 'room_rentals',
    photo: '/images/categories/room_rentals.jpg',
    tagline: 'Find your room',
    fromPrice: '$400/mo',
    popular: ['Private rooms', 'Furnished rooms', 'Short-term'],
    gradient: 'from-blue-600/80 to-indigo-800/80',
  },
  house_rent: {
    key: 'house_rent',
    photo: '/images/categories/house_rent.jpg',
    tagline: 'Houses for rent',
    fromPrice: '$1200/mo',
    popular: ['Detached homes', 'Townhouses', 'Duplexes'],
    gradient: 'from-rose-600/80 to-red-800/80',
  },
  basement_suite: {
    key: 'basement_suite',
    photo: '/images/categories/basement_suite.jpg',
    tagline: 'Cozy basement suites',
    fromPrice: '$800/mo',
    popular: ['Legal suites', 'Studios', 'Walkouts'],
    gradient: 'from-purple-600/80 to-violet-800/80',
  },
  apartment_condo: {
    key: 'apartment_condo',
    photo: '/images/categories/apartment_condo.jpg',
    tagline: 'Apartments & condos',
    fromPrice: '$1000/mo',
    popular: ['Apartments', 'Condos', 'Lofts'],
    gradient: 'from-indigo-600/80 to-blue-800/80',
  },
  locksmith: {
    key: 'locksmith',
    photo: '/images/categories/locksmith.jpg',
    tagline: 'Locks, keys & security',
    fromPrice: '$75',
    popular: ['Emergency lockout', 'Lock replacement', 'Smart locks'],
    gradient: 'from-slate-600/80 to-gray-800/80',
  },
  flower_shop: {
    key: 'flower_shop',
    photo: '/images/categories/flower_shop.jpg',
    tagline: 'Fresh flowers & arrangements',
    fromPrice: '$30',
    popular: ['Bouquets', 'Wedding flowers', 'Flower delivery'],
    gradient: 'from-pink-500/80 to-rose-700/80',
  },
  content_creator: {
    key: 'content_creator',
    photo: '/images/categories/content_creator.jpg',
    tagline: 'Videos, photos & content that converts',
    fromPrice: '$50',
    popular: ['Video editing', 'Social media content', 'Photography'],
    gradient: 'from-violet-500/80 to-purple-700/80',
  },
  web_developer: {
    key: 'web_developer',
    photo: '/images/categories/web_developer.jpg',
    tagline: 'Websites built to grow your business',
    fromPrice: '$500',
    popular: ['Website design', 'E-commerce sites', 'Landing pages'],
    gradient: 'from-indigo-500/80 to-blue-700/80',
  },
  app_developer: {
    key: 'app_developer',
    photo: '/images/categories/app_developer.jpg',
    tagline: 'Mobile apps, iOS & Android',
    fromPrice: '$1,000',
    popular: ['iOS apps', 'Android apps', 'Cross-platform apps'],
    gradient: 'from-teal-500/80 to-emerald-700/80',
  },
};

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
