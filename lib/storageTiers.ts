export type StorageTierKey = 'free' | 'starter' | 'plus' | 'pro'

// Bario's own storage tiers — informed by researching iCloud/Google
// One/Amazon Photos/MEGA (cheap entry tier, meaningful jumps, family
// sharing bundled free on paid tiers) but sized for website media rather
// than full-device backup, and priced as our own product, not a resale of
// anyone else's numbers. CAD, billed monthly.
export const STORAGE_TIERS: Record<StorageTierKey, { label: string; bytes: number; priceCentsCad: number }> = {
  free: { label: 'Free', bytes: 2 * 1024 ** 3, priceCentsCad: 0 },
  starter: { label: 'Starter', bytes: 20 * 1024 ** 3, priceCentsCad: 299 },
  plus: { label: 'Plus', bytes: 100 * 1024 ** 3, priceCentsCad: 799 },
  pro: { label: 'Pro', bytes: 500 * 1024 ** 3, priceCentsCad: 1999 },
}

export const STORAGE_TIER_KEYS = Object.keys(STORAGE_TIERS) as StorageTierKey[]

// Family sharing (any paid tier, no extra charge) pools storage across up to
// this many accounts, including the owner — matches iCloud's cap.
export const MAX_FAMILY_MEMBERS = 5

export function isStorageTierKey(v: unknown): v is StorageTierKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STORAGE_TIERS, v)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
