export type VpsTierKey = 'small' | 'medium' | 'large'

// Bario VPS — single region for launch (Hetzner's Nuremberg datacenter).
// Real markup over Hetzner's own raw cost (hetznerRawCostCentsEur, kept here
// purely for margin visibility, never charged directly) — this is the
// actual reason to buy from Bario instead of signing up with Hetzner
// directly, alongside the managed extras (auto security patching baked
// into every image, one dashboard next to everything else on bario.ca).
// PLACEHOLDER PRICES/SERVER TYPES — confirm against live Hetzner pricing
// and the user's intended margin before this goes live (see plan doc).
export const VPS_REGION = 'nbg1'

export const VPS_TIERS: Record<VpsTierKey, {
  label: string
  hetznerServerType: string
  vcpu: number
  ramGb: number
  diskGb: number
  hetznerRawCostCentsEur: number
  priceCentsCad: number
  backupAddonPriceCentsCad: number
}> = {
  small: { label: 'Small', hetznerServerType: 'cx23', vcpu: 2, ramGb: 4, diskGb: 40, hetznerRawCostCentsEur: 379, priceCentsCad: 1499, backupAddonPriceCentsCad: 300 },
  medium: { label: 'Medium', hetznerServerType: 'cx33', vcpu: 4, ramGb: 8, diskGb: 80, hetznerRawCostCentsEur: 729, priceCentsCad: 2999, backupAddonPriceCentsCad: 500 },
  large: { label: 'Large', hetznerServerType: 'cx43', vcpu: 8, ramGb: 16, diskGb: 160, hetznerRawCostCentsEur: 1399, priceCentsCad: 5999, backupAddonPriceCentsCad: 900 },
}

export const VPS_TIER_KEYS = Object.keys(VPS_TIERS) as VpsTierKey[]

export function isVpsTierKey(v: unknown): v is VpsTierKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VPS_TIERS, v)
}
