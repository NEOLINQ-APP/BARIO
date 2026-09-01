import type { BoServiceCatalogPriceType } from '@/lib/db'

// Full HydroBlasters.ca pricing catalog, transcribed verbatim from the
// client's own pricing sheet (2026-09-01) -- this is the ONE place these
// numbers live. The public catalog API, the Hydro AI chat system prompt,
// and the booking wizard's price display all read from the DB table this
// seeds (bo_service_catalog), never a second hardcoded copy -- see
// app/api/admin/bario-one/organizations/[id]/catalog/seed/route.ts.
//
// Duration estimates (estimatedDurationHours) are NOT from the client's
// sheet -- only "Signature Detail" gave an explicit range (3-4h, used
// as 3.5 here). Everywhere else is a reasonable estimate scaled by
// package tier and vehicle/property size, needed for the booking-
// availability rule (jobs <=4h can double-book a day, longer jobs need
// the full 72h gap) and for setting customer expectations. Flag these to
// the owner as adjustable, not as verified real-world timings.
//
// priceType: 'fixed' = quote exactly as listed. 'starting' = the number is
// a floor, final price depends on condition/scope -- Hydro must say
// "starts at". 'custom_quote' = no priceCents at all, never invent one.

export type SeedCatalogItem = {
  category: string
  subcategory?: string
  name: string
  slug: string
  priceType: BoServiceCatalogPriceType
  priceCents: number | null
  estimatedDurationHours: number | null
  description?: string
  inclusions?: string[]
  exclusions?: string[]
  isAddon?: boolean
}

const d = (dollars: number) => Math.round(dollars * 100)

const SIGNATURE_INCLUSIONS = [
  'Complete interior vacuum',
  'Interior surface cleaning',
  'Interior glass cleaning',
  'Door jamb cleaning',
  'Floor mat cleaning',
  'Interior conditioning',
  'Pre-rinse',
  'Foam wash',
  'Safe hand wash',
  'Wheel cleaning',
  'Tire cleaning',
  'Tire dressing',
  'Exterior glass cleaning',
  'Bug and road contamination removal',
  'Paint decontamination',
  'Exterior protection',
]
const SIGNATURE_EXCLUSIONS = [
  'Heavy pet hair removal',
  'Severe stain restoration',
  'Mold remediation',
  'Biohazard cleanup',
  'Paint correction',
  'Deep oxidation removal',
  'Ceramic coating',
  'Headlight restoration',
  'Excessive grease/oil removal',
  'Major adhesive/tar removal',
  'Engine bay detailing',
]

export const HYDROBLASTERS_CATALOG: SeedCatalogItem[] = [
  // ===== 2. AUTOMOTIVE — CARS & SUVS =====
  { category: 'Automotive', subcategory: 'Car', name: 'Essential Clean', slug: 'essential-clean-car', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 2, description: 'A professional maintenance-level clean for customers who want their vehicle cleaned and refreshed without the deeper restoration work of the higher packages.' },
  { category: 'Automotive', subcategory: 'SUV/Crossover', name: 'Essential Clean', slug: 'essential-clean-suv', priceType: 'fixed', priceCents: d(219), estimatedDurationHours: 2.25, description: 'A professional maintenance-level clean for customers who want their vehicle cleaned and refreshed without the deeper restoration work of the higher packages.' },
  { category: 'Automotive', subcategory: 'Car', name: 'Signature Detail', slug: 'signature-detail-car', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 3.5, inclusions: SIGNATURE_INCLUSIONS, exclusions: SIGNATURE_EXCLUSIONS },
  { category: 'Automotive', subcategory: 'SUV/Crossover', name: 'Signature Detail', slug: 'signature-detail-suv', priceType: 'fixed', priceCents: d(379), estimatedDurationHours: 3.5, inclusions: SIGNATURE_INCLUSIONS, exclusions: SIGNATURE_EXCLUSIONS },
  { category: 'Automotive', subcategory: 'Car', name: 'Premium Detail', slug: 'premium-detail-car', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 5, description: 'A more comprehensive detail than Signature, for customers wanting a deeper interior and exterior service.' },
  { category: 'Automotive', subcategory: 'SUV/Crossover', name: 'Premium Detail', slug: 'premium-detail-suv', priceType: 'fixed', priceCents: d(549), estimatedDurationHours: 5.5, description: 'A more comprehensive detail than Signature, for customers wanting a deeper interior and exterior service.' },
  { category: 'Automotive', subcategory: 'Car', name: 'Ultimate Detail', slug: 'ultimate-detail-car', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 7, description: "HydroBlasters' highest standard automotive detailing package." },
  { category: 'Automotive', subcategory: 'SUV/Crossover', name: 'Ultimate Detail', slug: 'ultimate-detail-suv', priceType: 'fixed', priceCents: d(799), estimatedDurationHours: 7.5, description: "HydroBlasters' highest standard automotive detailing package." },

  // ===== 3. PICKUP / WORK TRUCK =====
  { category: 'Pickup / Work Truck', name: 'Essential', slug: 'essential-pickup', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2.5 },
  { category: 'Pickup / Work Truck', name: 'Signature', slug: 'signature-pickup', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 4 },
  { category: 'Pickup / Work Truck', name: 'Premium', slug: 'premium-pickup', priceType: 'fixed', priceCents: d(549), estimatedDurationHours: 5.5 },
  { category: 'Pickup / Work Truck', name: 'Ultimate', slug: 'ultimate-pickup', priceType: 'fixed', priceCents: d(749), estimatedDurationHours: 7.5 },

  // ===== 4. SEMI TRUCK =====
  { category: 'Semi Truck', subcategory: 'Day Cab', name: 'Essential', slug: 'essential-daycab', priceType: 'fixed', priceCents: d(219), estimatedDurationHours: 2 },
  { category: 'Semi Truck', subcategory: 'Day Cab', name: 'Signature', slug: 'signature-daycab', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 3.5 },
  { category: 'Semi Truck', subcategory: 'Day Cab', name: 'Premium', slug: 'premium-daycab', priceType: 'fixed', priceCents: d(549), estimatedDurationHours: 5 },
  { category: 'Semi Truck', subcategory: 'Day Cab', name: 'Ultimate', slug: 'ultimate-daycab', priceType: 'fixed', priceCents: d(749), estimatedDurationHours: 7 },
  { category: 'Semi Truck', subcategory: 'Sleeper', name: 'Essential', slug: 'essential-sleeper', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2.5 },
  { category: 'Semi Truck', subcategory: 'Sleeper', name: 'Signature', slug: 'signature-sleeper', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 4.5 },
  { category: 'Semi Truck', subcategory: 'Sleeper', name: 'Premium', slug: 'premium-sleeper', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 6 },
  { category: 'Semi Truck', subcategory: 'Sleeper', name: 'Ultimate', slug: 'ultimate-sleeper', priceType: 'fixed', priceCents: d(799), estimatedDurationHours: 8 },
  { category: 'Semi Truck', subcategory: 'Tractor + Trailer', name: 'Essential', slug: 'essential-tractor-trailer', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 3, description: 'Covers the larger combined unit; may change depending on trailer size, condition, contamination and access.' },
  { category: 'Semi Truck', subcategory: 'Tractor + Trailer', name: 'Signature', slug: 'signature-tractor-trailer', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 5, description: 'Covers the larger combined unit; may change depending on trailer size, condition, contamination and access.' },
  { category: 'Semi Truck', subcategory: 'Tractor + Trailer', name: 'Premium', slug: 'premium-tractor-trailer', priceType: 'fixed', priceCents: d(899), estimatedDurationHours: 7, description: 'Covers the larger combined unit; may change depending on trailer size, condition, contamination and access.' },
  { category: 'Semi Truck', subcategory: 'Tractor + Trailer', name: 'Ultimate', slug: 'ultimate-tractor-trailer', priceType: 'fixed', priceCents: d(1199), estimatedDurationHours: 9, description: 'Covers the larger combined unit; may change depending on trailer size, condition, contamination and access.' },

  // ===== 5. FLEET RECURRING MAINTENANCE =====
  { category: 'Fleet Recurring Maintenance', subcategory: 'Car/SUV', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-car-suv', priceType: 'fixed', priceCents: d(179), estimatedDurationHours: 1 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Pickup/Work Truck', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-pickup', priceType: 'fixed', priceCents: d(219), estimatedDurationHours: 1.5 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Large Truck', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-large-truck', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Step Van/Delivery Van', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-step-van', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Day Cab', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-daycab', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Sleeper', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-sleeper', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 2.5 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Tractor + Trailer', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-tractor-trailer', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 3 },
  { category: 'Fleet Recurring Maintenance', subcategory: 'Specialty/Heavy Equipment', name: 'Fleet Recurring Maintenance', slug: 'fleet-maint-specialty', priceType: 'custom_quote', priceCents: null, estimatedDurationHours: null },

  // ===== 6. FLEET SIGNATURE =====
  { category: 'Fleet Signature', subcategory: 'Car/SUV', name: 'Fleet Signature', slug: 'fleet-sig-car-suv', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2 },
  { category: 'Fleet Signature', subcategory: 'Pickup', name: 'Fleet Signature', slug: 'fleet-sig-pickup', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 2.5 },
  { category: 'Fleet Signature', subcategory: 'Large Work Truck', name: 'Fleet Signature', slug: 'fleet-sig-large-work-truck', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Fleet Signature', subcategory: 'Day Cab', name: 'Fleet Signature', slug: 'fleet-sig-daycab', priceType: 'fixed', priceCents: d(449), estimatedDurationHours: 3 },
  { category: 'Fleet Signature', subcategory: 'Sleeper', name: 'Fleet Signature', slug: 'fleet-sig-sleeper', priceType: 'fixed', priceCents: d(549), estimatedDurationHours: 4 },
  { category: 'Fleet Signature', subcategory: 'Tractor + Trailer', name: 'Fleet Signature', slug: 'fleet-sig-tractor-trailer', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 5 },

  // ===== 7. FLEET PREMIUM =====
  { category: 'Fleet Premium', subcategory: 'Car/SUV', name: 'Fleet Premium', slug: 'fleet-prem-car-suv', priceType: 'fixed', priceCents: d(449), estimatedDurationHours: 3 },
  { category: 'Fleet Premium', subcategory: 'Pickup', name: 'Fleet Premium', slug: 'fleet-prem-pickup', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 3.5 },
  { category: 'Fleet Premium', subcategory: 'Work Truck', name: 'Fleet Premium', slug: 'fleet-prem-work-truck', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 4 },
  { category: 'Fleet Premium', subcategory: 'Day Cab', name: 'Fleet Premium', slug: 'fleet-prem-daycab', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 4.5 },
  { category: 'Fleet Premium', subcategory: 'Sleeper', name: 'Fleet Premium', slug: 'fleet-prem-sleeper', priceType: 'fixed', priceCents: d(799), estimatedDurationHours: 5.5 },
  { category: 'Fleet Premium', subcategory: 'Tractor + Trailer', name: 'Fleet Premium', slug: 'fleet-prem-tractor-trailer', priceType: 'fixed', priceCents: d(999), estimatedDurationHours: 6.5 },

  // ===== 8. BOAT DETAILING =====
  { category: 'Boat', subcategory: 'Small Boat (Under 20ft)', name: 'Essential', slug: 'boat-small-essential', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2 },
  { category: 'Boat', subcategory: 'Small Boat (Under 20ft)', name: 'Signature', slug: 'boat-small-signature', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 3.5 },
  { category: 'Boat', subcategory: 'Small Boat (Under 20ft)', name: 'Premium', slug: 'boat-small-premium', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 5 },
  { category: 'Boat', subcategory: 'Small Boat (Under 20ft)', name: 'Ultimate', slug: 'boat-small-ultimate', priceType: 'fixed', priceCents: d(999), estimatedDurationHours: 6.5 },
  { category: 'Boat', subcategory: 'Medium Cruiser (20-35ft)', name: 'Essential', slug: 'boat-medium-essential', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Boat', subcategory: 'Medium Cruiser (20-35ft)', name: 'Signature', slug: 'boat-medium-signature', priceType: 'fixed', priceCents: d(649), estimatedDurationHours: 4.5 },
  { category: 'Boat', subcategory: 'Medium Cruiser (20-35ft)', name: 'Premium', slug: 'boat-medium-premium', priceType: 'fixed', priceCents: d(899), estimatedDurationHours: 6 },
  { category: 'Boat', subcategory: 'Medium Cruiser (20-35ft)', name: 'Ultimate', slug: 'boat-medium-ultimate', priceType: 'fixed', priceCents: d(1299), estimatedDurationHours: 8 },
  { category: 'Boat', subcategory: 'Large Boat (31-40ft)', name: 'Essential', slug: 'boat-large-essential', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 4 },
  { category: 'Boat', subcategory: 'Large Boat (31-40ft)', name: 'Signature', slug: 'boat-large-signature', priceType: 'fixed', priceCents: d(899), estimatedDurationHours: 6 },
  { category: 'Boat', subcategory: 'Large Boat (31-40ft)', name: 'Premium', slug: 'boat-large-premium', priceType: 'fixed', priceCents: d(1299), estimatedDurationHours: 8 },
  { category: 'Boat', subcategory: 'Large Boat (31-40ft)', name: 'Ultimate', slug: 'boat-large-ultimate', priceType: 'fixed', priceCents: d(1799), estimatedDurationHours: 10 },
  { category: 'Boat', subcategory: 'Yacht (35ft+)', name: '40+ ft / Yacht', slug: 'boat-yacht', priceType: 'custom_quote', priceCents: null, estimatedDurationHours: null, description: 'Depends on length, condition, interior/exterior requirements, oxidation, contamination, access, surface type, and specialized products/equipment.' },

  // ===== 9. MOTORCYCLE =====
  { category: 'Motorcycle', name: 'Ride Clean', slug: 'ride-clean', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1 },
  { category: 'Motorcycle', name: 'Ride Signature', slug: 'ride-signature', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 1.5 },
  { category: 'Motorcycle', name: 'Ride Premium', slug: 'ride-premium', priceType: 'fixed', priceCents: d(349), estimatedDurationHours: 2.5 },
  { category: 'Motorcycle', name: 'Restoration', slug: 'motorcycle-restoration', priceType: 'starting', priceCents: d(499), estimatedDurationHours: 4, description: 'Starting price; may require an assessment.' },

  // ===== 10. RV DETAILING =====
  { category: 'RV', subcategory: 'Class B / Small RV', name: 'Essential', slug: 'rv-b-essential', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 2.5 },
  { category: 'RV', subcategory: 'Class B / Small RV', name: 'Signature', slug: 'rv-b-signature', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 4 },
  { category: 'RV', subcategory: 'Class B / Small RV', name: 'Premium', slug: 'rv-b-premium', priceType: 'fixed', priceCents: d(899), estimatedDurationHours: 6 },
  { category: 'RV', subcategory: 'Class B / Small RV', name: 'Ultimate', slug: 'rv-b-ultimate', priceType: 'fixed', priceCents: d(1299), estimatedDurationHours: 8 },
  { category: 'RV', subcategory: 'Class C / Medium RV', name: 'Essential', slug: 'rv-c-essential', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 3.5 },
  { category: 'RV', subcategory: 'Class C / Medium RV', name: 'Signature', slug: 'rv-c-signature', priceType: 'fixed', priceCents: d(749), estimatedDurationHours: 5 },
  { category: 'RV', subcategory: 'Class C / Medium RV', name: 'Premium', slug: 'rv-c-premium', priceType: 'fixed', priceCents: d(1099), estimatedDurationHours: 7 },
  { category: 'RV', subcategory: 'Class C / Medium RV', name: 'Ultimate', slug: 'rv-c-ultimate', priceType: 'fixed', priceCents: d(1599), estimatedDurationHours: 9 },
  { category: 'RV', subcategory: 'Class A / Large RV', name: 'Essential', slug: 'rv-a-essential', priceType: 'fixed', priceCents: d(699), estimatedDurationHours: 4.5 },
  { category: 'RV', subcategory: 'Class A / Large RV', name: 'Signature', slug: 'rv-a-signature', priceType: 'fixed', priceCents: d(999), estimatedDurationHours: 6.5 },
  { category: 'RV', subcategory: 'Class A / Large RV', name: 'Premium', slug: 'rv-a-premium', priceType: 'fixed', priceCents: d(1499), estimatedDurationHours: 8.5 },
  { category: 'RV', subcategory: 'Class A / Large RV', name: 'Ultimate', slug: 'rv-a-ultimate', priceType: 'fixed', priceCents: d(1999), estimatedDurationHours: 11 },

  // ===== 11. HEAVY EQUIPMENT =====
  { category: 'Heavy Equipment', name: 'Basic', slug: 'heavy-basic', priceType: 'starting', priceCents: d(249), estimatedDurationHours: 3, description: 'Depends heavily on equipment type, size, dirt level, mud, grease, oil, hydraulic contamination, job-site conditions, accessibility, required equipment/chemicals, and time required.' },
  { category: 'Heavy Equipment', name: 'Deep Clean', slug: 'heavy-deep-clean', priceType: 'starting', priceCents: d(399), estimatedDurationHours: 5, description: 'Depends heavily on equipment type, size, dirt level, mud, grease, oil, hydraulic contamination, job-site conditions, accessibility, required equipment/chemicals, and time required.' },
  { category: 'Heavy Equipment', name: 'Premium', slug: 'heavy-premium', priceType: 'starting', priceCents: d(599), estimatedDurationHours: 7, description: 'Depends heavily on equipment type, size, dirt level, mud, grease, oil, hydraulic contamination, job-site conditions, accessibility, required equipment/chemicals, and time required.' },
  { category: 'Heavy Equipment', name: 'Industrial Restoration', slug: 'heavy-industrial-restoration', priceType: 'starting', priceCents: d(899), estimatedDurationHours: 10, description: 'Depends heavily on equipment type, size, dirt level, mud, grease, oil, hydraulic contamination, job-site conditions, accessibility, required equipment/chemicals, and time required.' },

  // ===== 12. RESIDENTIAL — HOUSE WASH =====
  { category: 'Home', subcategory: 'Under 1,500 sq ft', name: 'House Wash', slug: 'house-wash-under-1500', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 1.5 },
  { category: 'Home', subcategory: '1,500-2,500 sq ft', name: 'House Wash', slug: 'house-wash-1500-2500', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2 },
  { category: 'Home', subcategory: '2,500-3,500 sq ft', name: 'House Wash', slug: 'house-wash-2500-3500', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Home', subcategory: '3,500-5,000 sq ft', name: 'House Wash', slug: 'house-wash-3500-5000', priceType: 'fixed', priceCents: d(499), estimatedDurationHours: 4 },
  { category: 'Home', subcategory: '5,000+ sq ft', name: 'House Wash', slug: 'house-wash-5000-plus', priceType: 'custom_quote', priceCents: null, estimatedDurationHours: null },
  { category: 'Home', name: 'Premium House Package', slug: 'premium-house-package', priceType: 'starting', priceCents: d(499), estimatedDurationHours: 5 },

  // ===== 13. DRIVEWAY CLEANING =====
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Driveway Cleaning (Small)', slug: 'driveway-small', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1 },
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Driveway Cleaning (Medium)', slug: 'driveway-medium', priceType: 'fixed', priceCents: d(199), estimatedDurationHours: 1.5 },
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Driveway Cleaning (Large)', slug: 'driveway-large', priceType: 'fixed', priceCents: d(299), estimatedDurationHours: 2.5 },
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Driveway Cleaning (Extra Large)', slug: 'driveway-xl', priceType: 'starting', priceCents: d(399), estimatedDurationHours: 3.5 },
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Driveway + Walkway', slug: 'driveway-walkway', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 2 },
  { category: 'Home', subcategory: 'Patio & Deck', name: 'Driveway + Walkway + Patio', slug: 'driveway-walkway-patio', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Home', subcategory: 'Driveway & Walkway', name: 'Complete Concrete Cleaning', slug: 'complete-concrete-cleaning', priceType: 'fixed', priceCents: d(599), estimatedDurationHours: 4 },

  // ===== 14. DECK & FENCE =====
  { category: 'Home', subcategory: 'Patio & Deck', name: 'Deck Cleaning (Small)', slug: 'deck-small', priceType: 'fixed', priceCents: d(149), estimatedDurationHours: 1 },
  { category: 'Home', subcategory: 'Patio & Deck', name: 'Deck Cleaning (Medium)', slug: 'deck-medium', priceType: 'fixed', priceCents: d(249), estimatedDurationHours: 1.5 },
  { category: 'Home', subcategory: 'Patio & Deck', name: 'Deck Cleaning (Large)', slug: 'deck-large', priceType: 'fixed', priceCents: d(399), estimatedDurationHours: 2.5 },
  { category: 'Home', subcategory: 'Perimeter Fence', name: 'Fence Cleaning', slug: 'fence-cleaning', priceType: 'starting', priceCents: d(199), estimatedDurationHours: 2 },

  // ===== 15. COMMERCIAL CLEANING =====
  { category: 'Commercial', name: 'Commercial Essential', slug: 'commercial-essential', priceType: 'starting', priceCents: d(399), estimatedDurationHours: 3 },
  { category: 'Commercial', name: 'Commercial Signature', slug: 'commercial-signature', priceType: 'starting', priceCents: d(699), estimatedDurationHours: 5 },
  { category: 'Commercial', name: 'Commercial Premium', slug: 'commercial-premium', priceType: 'starting', priceCents: d(999), estimatedDurationHours: 7 },
  { category: 'Commercial', name: 'Commercial Maintenance Contract', slug: 'commercial-maintenance-contract', priceType: 'custom_quote', priceCents: null, estimatedDurationHours: null, description: 'Recommended for customers with recurring commercial needs.' },

  // ===== 16. INDUSTRIAL CLEANING =====
  { category: 'Commercial', subcategory: 'Industrial', name: 'Equipment Cleaning', slug: 'industrial-equipment-cleaning', priceType: 'starting', priceCents: d(399), estimatedDurationHours: 4 },
  { category: 'Commercial', subcategory: 'Industrial', name: 'Facility Cleaning', slug: 'industrial-facility-cleaning', priceType: 'starting', priceCents: d(799), estimatedDurationHours: 7 },
  { category: 'Commercial', subcategory: 'Industrial', name: 'Industrial Deep Cleaning', slug: 'industrial-deep-cleaning', priceType: 'starting', priceCents: d(1499), estimatedDurationHours: 10 },
  { category: 'Commercial', subcategory: 'Industrial', name: 'Large Industrial Projects', slug: 'large-industrial-projects', priceType: 'starting', priceCents: d(2499), estimatedDurationHours: 12, description: 'Requires scope assessment and may require photos, measurements, site information and/or an on-site assessment.' },

  // ===== 17. À-LA-CARTE — EXTERIOR ADD-ONS =====
  { category: 'Add-on', subcategory: 'Exterior', name: 'Hand Wash & Dry', slug: 'addon-hand-wash-dry', priceType: 'fixed', priceCents: d(40), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Bug/Sap/Tar Removal', slug: 'addon-bug-sap-tar-removal', priceType: 'starting', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Wet Wax', slug: 'addon-wet-wax', priceType: 'fixed', priceCents: d(60), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Hand Wax', slug: 'addon-hand-wax', priceType: 'fixed', priceCents: d(175), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Clay Bar', slug: 'addon-clay-bar', priceType: 'starting', priceCents: d(150), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Paint Decontamination', slug: 'addon-paint-decontamination', priceType: 'starting', priceCents: d(150), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Paint Sealant', slug: 'addon-paint-sealant', priceType: 'fixed', priceCents: d(350), estimatedDurationHours: 2, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Machine/Power Polish', slug: 'addon-machine-power-polish', priceType: 'starting', priceCents: d(300), estimatedDurationHours: 2.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Paint Correction', slug: 'addon-paint-correction', priceType: 'starting', priceCents: d(500), estimatedDurationHours: 4, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Ceramic Coating', slug: 'addon-ceramic-coating', priceType: 'starting', priceCents: d(699), estimatedDurationHours: 5, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Premium Ceramic', slug: 'addon-premium-ceramic', priceType: 'starting', priceCents: d(999), estimatedDurationHours: 6, isAddon: true },
  { category: 'Add-on', subcategory: 'Exterior', name: 'Professional Ceramic', slug: 'addon-professional-ceramic', priceType: 'starting', priceCents: d(1499), estimatedDurationHours: 8, isAddon: true },

  // ===== 18. WHEEL & TIRE =====
  { category: 'Add-on', subcategory: 'Wheel & Tire', name: 'Wheel Cleaning', slug: 'addon-wheel-cleaning', priceType: 'fixed', priceCents: d(40), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Wheel & Tire', name: 'Wheel Deep Cleaning', slug: 'addon-wheel-deep-cleaning', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Add-on', subcategory: 'Wheel & Tire', name: 'Wheel Polish', slug: 'addon-wheel-polish', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Wheel & Tire', name: 'Tire Shine', slug: 'addon-tire-shine', priceType: 'fixed', priceCents: d(15), estimatedDurationHours: 0.25, isAddon: true },
  { category: 'Add-on', subcategory: 'Wheel & Tire', name: 'Wheel Protection', slug: 'addon-wheel-protection-wt', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },

  // ===== 19. INTERIOR =====
  { category: 'Add-on', subcategory: 'Interior', name: 'Interior Vacuum', slug: 'addon-interior-vacuum', priceType: 'fixed', priceCents: d(40), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Carpet Shampoo', slug: 'addon-carpet-shampoo', priceType: 'fixed', priceCents: d(60), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Carpet Extraction', slug: 'addon-carpet-extraction', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Upholstery Cleaning', slug: 'addon-upholstery-cleaning', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Leather Cleaning & Conditioning', slug: 'addon-leather-cleaning', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Fabric Protection', slug: 'addon-fabric-protection', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Headliner Cleaning', slug: 'addon-headliner-cleaning', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Pet Hair Removal', slug: 'addon-pet-hair-removal', priceType: 'starting', priceCents: d(60), estimatedDurationHours: null, description: '$60/hour + GST — billed hourly, duration depends on severity.', isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Ozone Treatment', slug: 'addon-ozone-treatment', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Odor Treatment', slug: 'addon-odor-treatment', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Disinfection', slug: 'addon-disinfection', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 0.75, isAddon: true },
  { category: 'Add-on', subcategory: 'Interior', name: 'Deep Interior Restoration', slug: 'addon-deep-interior-restoration', priceType: 'starting', priceCents: d(250), estimatedDurationHours: 3, isAddon: true },

  // ===== 20. ENGINE / HEAVY CLEANING =====
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Engine Bay Detail', slug: 'addon-engine-bay-detail', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Engine Bay Deep Cleaning', slug: 'addon-engine-bay-deep-cleaning', priceType: 'fixed', priceCents: d(150), estimatedDurationHours: 1.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Heavy Contamination', slug: 'addon-heavy-contamination', priceType: 'starting', priceCents: d(200), estimatedDurationHours: 2, isAddon: true },
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Undercarriage Cleaning', slug: 'addon-undercarriage-cleaning', priceType: 'starting', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Equipment Degreasing', slug: 'addon-equipment-degreasing', priceType: 'starting', priceCents: d(150), estimatedDurationHours: 2, isAddon: true },
  { category: 'Add-on', subcategory: 'Engine / Heavy', name: 'Heavy Grease/Oil Removal', slug: 'addon-heavy-grease-oil-removal', priceType: 'starting', priceCents: d(200), estimatedDurationHours: null, description: '$200+/hour + GST — billed hourly, duration depends on severity.', isAddon: true },

  // ===== 21. SPECIALTY SERVICES =====
  { category: 'Add-on', subcategory: 'Specialty', name: 'Headlight Restoration', slug: 'addon-headlight-restoration', priceType: 'fixed', priceCents: d(150), estimatedDurationHours: 1, isAddon: true },
  { category: 'Add-on', subcategory: 'Specialty', name: 'Glass Protection', slug: 'addon-glass-protection', priceType: 'fixed', priceCents: d(75), estimatedDurationHours: 0.5, isAddon: true },
  { category: 'Add-on', subcategory: 'Specialty', name: 'Wheel Protection', slug: 'addon-wheel-protection-specialty', priceType: 'fixed', priceCents: d(100), estimatedDurationHours: 1, isAddon: true },
]
