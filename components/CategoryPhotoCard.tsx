import { Link } from '@/i18n/routing';
import { categoryShowcase } from '@/lib/category-meta';
import type { Category } from '@/lib/categories';

/**
 * Marketplace-style photo card for one service category.
 * Photo + name + tagline + "from $X" — Airbnb/TaskRabbit look.
 */
export function CategoryPhotoCard({
  category,
  label,
  fromLabel,
}: {
  category: Category;
  label: string;
  fromLabel: string;
}) {
  const meta = categoryShowcase[category];
  return (
    <Link
      href={`/services?category=${category}`}
      className="group relative block overflow-hidden rounded-3xl shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.photo}
        alt={label}
        loading="lazy"
        className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div
        className={`absolute inset-0 bg-gradient-to-t ${meta.gradient} via-black/20 to-transparent`}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-lg font-extrabold text-white">{label}</h3>
        <p className="mt-0.5 text-xs font-medium text-white/85">{meta.tagline}</p>
        <span className="mt-2 inline-block rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-brand-800">
          {fromLabel.replace('{price}', meta.fromPrice)}
        </span>
      </div>
    </Link>
  );
}
