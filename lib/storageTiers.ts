export type StorageTierKey = 'free' | 'starter' | 'plus' | 'pro' | 'max' | 'ultra'

// X-Drive (formerly "Media Library") storage tiers — set directly by the
// user 2026-07-27, replacing the earlier researched pricing below. CAD,
// billed monthly.
export const STORAGE_TIERS: Record<StorageTierKey, { label: string; bytes: number; priceCentsCad: number }> = {
  free: { label: 'Free', bytes: 10 * 1024 ** 3, priceCentsCad: 0 },
  starter: { label: 'Starter', bytes: 50 * 1024 ** 3, priceCentsCad: 99 },
  plus: { label: 'Plus', bytes: 200 * 1024 ** 3, priceCentsCad: 299 },
  pro: { label: 'Pro', bytes: 2 * 1024 ** 4, priceCentsCad: 999 },
  max: { label: 'Max', bytes: 6 * 1024 ** 4, priceCentsCad: 2999 },
  ultra: { label: 'Ultra', bytes: 12 * 1024 ** 4, priceCentsCad: 5999 },
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
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 4).toFixed(1)} TB`
}
