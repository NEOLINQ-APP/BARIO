import type { BoServiceCatalogPriceType } from '@/lib/db'

// V2 catalog (2026-09-02) — replaces lib/hydroblastersCatalog.ts entirely.
// The client restructured the site into two strictly separate divisions
// (their words: "CRITICAL ARCHITECTURE... never mix"):
//   - Pressure Washing: PROPERTIES only (Residential/Commercial/Industrial)
//   - Mobile Detailing: VEHICLES & EQUIPMENT only (Automotive/Marine/
//     Motorcycle/Semi Truck/Heavy Equipment)
// `category` doubles as the division+tab key so the frontend can classify
// items into the right division/sub-tab without a schema change — no
// separate "division" column needed, category name alone is unambiguous
// between the two lists below. Add-ons carry the SAME category as the
// group they belong to (not a generic "Add-on" bucket like V1) so a
// filter-by-category query naturally scopes add-ons to the right tab too.

export type SeedCatalogItem = {
  category: string
  subcategory?: string | null
  name: string
  slug: string
  priceType: BoServiceCatalogPriceType
  priceCents: number | null
  estimatedDurationHours: number | null
  description?: string | null
  inclusions?: string[]
  exclusions?: string[]
  isAddon?: boolean
  popular?: boolean
}

const d = (dollars: number) => Math.round(dollars * 100)

export const HYDROBLASTERS_CATALOG_V2: SeedCatalogItem[] = [
  // ================= DIVISION 1: PRESSURE WASHING (properties only) =================
  // ----- Residential -----
  { category: 'Residential', name: 'Essential Wash', slug: 'pw-res-essential', priceType: 'starting', priceCents: d(149), estimatedDurationHours: 1.5, description: 'Driveway & sidewalk.', inclusions: ['Driveway pressure wash', 'Sidewalk pressure wash'] },
  { category: 'Residential', name: 'House Wash', slug: 'pw-res-house-wash', priceType: 'starting', priceCents: d(299), estimatedDurationHours: 2.5, description: 'Siding + windows.', inclusions: ['Full exterior siding soft-wash', 'Exterior window rinse'] },
  { category: 'Residential', name: 'Complete Exterior', slug: 'pw-res-complete-exterior', priceType: 'starting', priceCents: d(599), estimatedDurationHours: 4, description: 'Roof + gutters + deck + driveway.', inclusions: ['Roof soft-wash', 'Gutter exterior wash', 'Deck wash', 'Driveway pressure wash'], popular: true },

  // ----- Commercial -----
  { category: 'Commercial', name: 'Storefront Refresh', slug: 'pw-com-storefront', priceType: 'starting', priceCents: d(249), estimatedDurationHours: 2 },
  { category: 'Commercial', name: 'Parking Lot & Sidewalk', slug: 'pw-com-parking-lot', priceType: 'starting', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Commercial', name: 'Full Building Wash', slug: 'pw-com-full-building', priceType: 'starting', priceCents: d(799), estimatedDurationHours: 6 },
  { category: 'Commercial', name: 'Dumpster & Grease Pad', slug: 'pw-com-dumpster-grease-pad', priceType: 'starting', priceCents: d(349), estimatedDurationHours: 2.5 },

  // ----- Industrial -----
  { category: 'Industrial', name: 'Warehouse Floor', slug: 'pw-ind-warehouse-floor', priceType: 'starting', priceCents: d(899), estimatedDurationHours: 7 },
  { category: 'Industrial', name: 'Fleet Yard', slug: 'pw-ind-fleet-yard', priceType: 'starting', priceCents: d(649), estimatedDurationHours: 5 },
  { category: 'Industrial', name: 'Heavy Equipment Wash Pad', slug: 'pw-ind-wash-pad', priceType: 'starting', priceCents: d(499), estimatedDurationHours: 4 },
  { category: 'Industrial', name: 'Graffiti & Grime', slug: 'pw-ind-graffiti-grime', priceType: 'starting', priceCents: d(450), estimatedDurationHours: 3 },

  // ----- Pressure Washing add-ons (apply across Residential/Commercial/Industrial) -----
  { category: 'Residential', name: 'Extra Surface', slug: 'pw-addon-extra-surface', priceType: 'starting', priceCents: d(0.35), estimatedDurationHours: 0.25, description: '$0.35 per 100 sq ft', isAddon: true },
  { category: 'Residential', name: 'Hot Water Upgrade', slug: 'pw-addon-hot-water', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 0, isAddon: true },
  { category: 'Residential', name: 'Gutter Brightening', slug: 'pw-addon-gutter-brightening', priceType: 'fixed', priceCents: d(99), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Residential', name: 'Window Cleaning', slug: 'pw-addon-window-cleaning', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1, isAddon: true },
  { category: 'Residential', name: 'Soft Wash', slug: 'pw-addon-soft-wash', priceType: 'fixed', priceCents: d(89), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Residential', name: 'Sealer Application', slug: 'pw-addon-sealer', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Commercial', name: 'Extra Surface', slug: 'pw-addon-extra-surface-com', priceType: 'starting', priceCents: d(0.35), estimatedDurationHours: 0.25, description: '$0.35 per 100 sq ft', isAddon: true },
  { category: 'Commercial', name: 'Hot Water Upgrade', slug: 'pw-addon-hot-water-com', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 0, isAddon: true },
  { category: 'Commercial', name: 'Window Cleaning', slug: 'pw-addon-window-cleaning-com', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1, isAddon: true },
  { category: 'Commercial', name: 'Sealer Application', slug: 'pw-addon-sealer-com', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Industrial', name: 'Extra Surface', slug: 'pw-addon-extra-surface-ind', priceType: 'starting', priceCents: d(0.35), estimatedDurationHours: 0.25, description: '$0.35 per 100 sq ft', isAddon: true },
  { category: 'Industrial', name: 'Hot Water Upgrade', slug: 'pw-addon-hot-water-ind', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 0, isAddon: true },

  // ================= DIVISION 2: MOBILE DETAILING (vehicles & equipment only) =================
  // ----- Automotive -----
  { category: 'Automotive', subcategory: 'Car', name: 'Essential Clean', slug: 'md-auto-essential-car', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 2 },
  { category: 'Automotive', subcategory: 'SUV', name: 'Essential Clean', slug: 'md-auto-essential-suv', priceType: 'fixed', priceCents: d(229), estimatedDurationHours: 2.25 },
  { category: 'Automotive', subcategory: 'Car', name: 'Premium Shine', slug: 'md-auto-premium-car', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 3.5, popular: true },
  { category: 'Automotive', subcategory: 'SUV', name: 'Premium Shine', slug: 'md-auto-premium-suv', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 4, popular: true },
  { category: 'Automotive', subcategory: 'Car', name: 'Hydro Ultimate', slug: 'md-auto-ultimate-car', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 6 },
  { category: 'Automotive', subcategory: 'SUV', name: 'Hydro Ultimate', slug: 'md-auto-ultimate-suv', priceType: 'fixed', priceCents: d(649), estimatedDurationHours: 6.5 },

  // ----- Marine (Boats) -----
  { category: 'Marine', name: 'Boat Wash', slug: 'md-marine-wash', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2 },
  { category: 'Marine', name: 'Full Detail', slug: 'md-marine-full-detail', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 4.5 },
  { category: 'Marine', name: 'Ceramic', slug: 'md-marine-ceramic', priceType: 'starting', priceCents: d(1299), estimatedDurationHours: 8 },

  // ----- Motorcycle -----
  { category: 'Motorcycle', name: 'Quick Shine', slug: 'md-moto-quick-shine', priceType: 'fixed', priceCents: d(99), estimatedDurationHours: 0.75 },
  { category: 'Motorcycle', name: 'Full Detail', slug: 'md-moto-full-detail', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2 },

  // ----- Semi Truck -----
  { category: 'Semi Truck', name: 'Cab Interior', slug: 'md-semi-cab-interior', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1.5 },
  { category: 'Semi Truck', name: 'Exterior Wash', slug: 'md-semi-exterior-wash', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 2 },
  { category: 'Semi Truck', name: 'Full Fleet', slug: 'md-semi-full-fleet', priceType: 'starting', priceCents: d(499), estimatedDurationHours: 4 },

  // ----- Heavy Equipment -----
  { category: 'Heavy Equipment', name: 'Equipment Wash', slug: 'md-heavy-equipment-wash', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2.5 },
  { category: 'Heavy Equipment', name: 'Deep Clean', slug: 'md-heavy-deep-clean', priceType: 'starting', priceCents: d(649), estimatedDurationHours: 5 },

  // ----- Automotive add-ons -----
  { category: 'Automotive', name: 'Hand Wash & Dry', slug: 'md-addon-hand-wash-dry', priceType: 'fixed', priceCents: d(40), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Automotive', name: 'Bug/Sap/Tar Removal', slug: 'md-addon-bug-sap-tar', priceType: 'starting', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Automotive', name: 'Wet Wax', slug: 'md-addon-wet-wax', priceType: 'fixed', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Automotive', name: 'Hand Wax', slug: 'md-addon-hand-wax', priceType: 'fixed', priceCents: d(175), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Automotive', name: 'Clay Bar', slug: 'md-addon-clay-bar', priceType: 'starting', priceCents: d(150), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Automotive', name: 'Paint Decontamination', slug: 'md-addon-paint-decon', priceType: 'starting', priceCents: d(150), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Automotive', name: 'Interior Shampoo', slug: 'md-addon-interior-shampoo', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 1, isAddon: true },
  { category: 'Automotive', name: 'Engine Bay', slug: 'md-addon-engine-bay', priceType: 'fixed', priceCents: d(50), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Automotive', name: 'Ceramic Sealant', slug: 'md-addon-ceramic-sealant', priceType: 'starting', priceCents: d(250), estimatedDurationHours: 3, isAddon: true },

  // ----- Marine add-ons (relevant subset) -----
  { category: 'Marine', name: 'Interior Shampoo', slug: 'md-addon-interior-shampoo-marine', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 1, isAddon: true },
  { category: 'Marine', name: 'Ceramic Sealant', slug: 'md-addon-ceramic-sealant-marine', priceType: 'starting', priceCents: d(250), estimatedDurationHours: 3, isAddon: true },

  // ----- Motorcycle add-ons -----
  { category: 'Motorcycle', name: 'Wet Wax', slug: 'md-addon-wet-wax-moto', priceType: 'fixed', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Motorcycle', name: 'Hand Wax', slug: 'md-addon-hand-wax-moto', priceType: 'fixed', priceCents: d(175), estimatedDurationHours: 1.5, isAddon: true },

  // ----- Semi Truck add-ons -----
  { category: 'Semi Truck', name: 'Bug/Sap/Tar Removal', slug: 'md-addon-bug-sap-tar-semi', priceType: 'starting', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Semi Truck', name: 'Engine Bay', slug: 'md-addon-engine-bay-semi', priceType: 'fixed', priceCents: d(50), estimatedDurationHours: 0.75, isAddon: true },

  // ----- Heavy Equipment add-ons -----
  { category: 'Heavy Equipment', name: 'Engine Bay', slug: 'md-addon-engine-bay-heavy', priceType: 'fixed', priceCents: d(50), estimatedDurationHours: 0.75, isAddon: true },
]
