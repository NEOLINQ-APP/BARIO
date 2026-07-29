export type VpsTierKey = 'small' | 'medium' | 'large'
export type BillingCycle = 'monthly' | 'annual' | 'biennial' | 'triennial'

export const BILLING_CYCLES: Record<BillingCycle, { label: string; stripeInterval: 'month' | 'year'; stripeIntervalCount: number; months: number }> = {
  monthly: { label: 'Monthly', stripeInterval: 'month', stripeIntervalCount: 1, months: 1 },
  annual: { label: 'Yearly', stripeInterval: 'year', stripeIntervalCount: 1, months: 12 },
  biennial: { label: '2 Years', stripeInterval: 'year', stripeIntervalCount: 2, months: 24 },
  triennial: { label: '3 Years', stripeInterval: 'year', stripeIntervalCount: 3, months: 36 },
}
export const BILLING_CYCLE_KEYS = Object.keys(BILLING_CYCLES) as BillingCycle[]
export function isBillingCycle(v: unknown): v is BillingCycle {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BILLING_CYCLES, v)
}

// Bario VPS — single region for launch (Hetzner's Nuremberg datacenter).
// Real markup over Hetzner's own raw cost (hetznerRawCostCentsEur, kept here
// purely for margin visibility, never charged directly). Longer commitments
// get deeper discounts (annual ~17% off monthly*12, 2yr ~25% off, 3yr ~33%
// off) — same "reward commitment" structure hosting providers commonly use.
// PLACEHOLDER PRICES/SERVER TYPES/DISCOUNTS — confirm against live Hetzner
// pricing and the user's intended margin before this goes live.
export const VPS_REGION = 'nbg1'

type CyclePricing = Record<BillingCycle, { priceCentsCad: number; backupAddonPriceCentsCad: number }>

export const VPS_TIERS: Record<VpsTierKey, {
  label: string
  hetznerServerType: string
  vcpu: number
  ramGb: number
  diskGb: number
  hetznerRawCostCentsEur: number
  cycles: CyclePricing
}> = {
  small: {
    label: 'Small', hetznerServerType: 'cx23', vcpu: 2, ramGb: 4, diskGb: 40, hetznerRawCostCentsEur: 379,
    cycles: {
      monthly: { priceCentsCad: 1499, backupAddonPriceCentsCad: 300 },
      annual: { priceCentsCad: 14999, backupAddonPriceCentsCad: 2999 },
      biennial: { priceCentsCad: 26999, backupAddonPriceCentsCad: 5399 },
      triennial: { priceCentsCad: 35999, backupAddonPriceCentsCad: 7299 },
    },
  },
  medium: {
    label: 'Medium', hetznerServerType: 'cx33', vcpu: 4, ramGb: 8, diskGb: 80, hetznerRawCostCentsEur: 729,
    cycles: {
      monthly: { priceCentsCad: 2999, backupAddonPriceCentsCad: 500 },
      annual: { priceCentsCad: 29999, backupAddonPriceCentsCad: 4999 },
      biennial: { priceCentsCad: 53999, backupAddonPriceCentsCad: 8999 },
      triennial: { priceCentsCad: 71999, backupAddonPriceCentsCad: 12299 },
    },
  },
  large: {
    label: 'Large', hetznerServerType: 'cx43', vcpu: 8, ramGb: 16, diskGb: 160, hetznerRawCostCentsEur: 1399,
    cycles: {
      monthly: { priceCentsCad: 5999, backupAddonPriceCentsCad: 900 },
      annual: { priceCentsCad: 59999, backupAddonPriceCentsCad: 8999 },
      biennial: { priceCentsCad: 107999, backupAddonPriceCentsCad: 16199 },
      triennial: { priceCentsCad: 143999, backupAddonPriceCentsCad: 21999 },
    },
  },
}

export const VPS_TIER_KEYS = Object.keys(VPS_TIERS) as VpsTierKey[]

export function isVpsTierKey(v: unknown): v is VpsTierKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VPS_TIERS, v)
}
