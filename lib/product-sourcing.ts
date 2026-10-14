/**
 * Shared product-sourcing types for Zervia's product integrations.
 *
 * Multiple supplier integrations (CJ Dropshipping, AliExpress, 1688)
 * normalize their results into SourcedProduct so the provider UI and the
 * products table stay supplier-agnostic.
 *
 * Expected `products` table columns (see migration 0030_products.sql,
 * owned by the CJ integration):
 *   id, provider_id, supplier ('cj' | 'aliexpress' | 'manual'),
 *   supplier_product_id, name, description, price_cents, cost_cents,
 *   images text[], category, stock, active, created_at
 */

export type ProductSupplier = 'cj' | 'aliexpress' | '1688' | 'tiktok' | 'manual';

export interface SourcedProduct {
  /** Supplier-side product id (or the source URL for manual/1688 imports). */
  supplierProductId: string;
  supplier: ProductSupplier;
  /** Display title (English where possible). */
  name: string;
  /** Original-language title (e.g. Chinese from 1688), when available. */
  originalName?: string;
  description?: string;
  /** Supplier cost in cents of the provider's currency (informational). */
  costCents?: number | null;
  images: string[];
  /** Source page URL for reference / manual ordering. */
  sourceUrl?: string;
}

/**
 * Payload the provider confirms when adding a sourced product to their shop.
 */
export interface SourcedProductDraft extends SourcedProduct {
  /** Provider's chosen sale price in cents. */
  priceCents: number;
  category?: string;
  stock?: number;
}

export function emptySourcedProductDraft(p: SourcedProduct): SourcedProductDraft {
  return { ...p, priceCents: 0, category: undefined, stock: 0 };
}
