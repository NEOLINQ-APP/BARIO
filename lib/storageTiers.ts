export type StorageTierKey = 'free' | 'plus' | 'pro' | 'business'

export const STORAGE_TIERS: Record<StorageTierKey, { label: string; bytes: number; priceCentsCad: number }> = {
  free: { label: 'Free', bytes: 1 * 1024 ** 3, priceCentsCad: 0 },
  plus: { label: 'Plus', bytes: 10 * 1024 ** 3, priceCentsCad: 499 },
  pro: { label: 'Pro', bytes: 50 * 1024 ** 3, priceCentsCad: 1499 },
  business: { label: 'Business', bytes: 250 * 1024 ** 3, priceCentsCad: 3999 },
}

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
