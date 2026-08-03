import { VPS_TIERS, BILLING_CYCLES, type VpsTierKey, type BillingCycle } from '@/lib/vpsTiers'
import { STORAGE_TIERS, STORAGE_TIER_KEYS } from '@/lib/storageTiers'

export type CatalogItem = { key: string; category: string; label: string; unitPriceCents: number; currency: string }

// Hosting plan prices are duplicated from app/api/assistant/chat/route.ts's
// system prompt (the other place these numbers are hand-maintained) rather
// than pulled from a shared constant — no shared pricing module existed for
// this to reuse, and this project's convention favors a few duplicated
// literals over refactoring unrelated, working code just to add one. If
// these prices ever change, update both places.
const HOSTING_PLANS = [
  { key: 'starter', label: 'Hosting Plan — Starter (monthly)', priceCentsCad: 1900 },
  { key: 'business', label: 'Hosting Plan — Business (monthly)', priceCentsCad: 4900 },
  { key: 'agency', label: 'Hosting Plan — Agency (monthly)', priceCentsCad: 14900 },
]

export function getStaticCatalog(): CatalogItem[] {
  const items: CatalogItem[] = []

  for (const plan of HOSTING_PLANS) {
    items.push({ key: `plan:${plan.key}`, category: 'Hosting Plans', label: plan.label, unitPriceCents: plan.priceCentsCad, currency: 'CAD' })
  }

  for (const tierKey of Object.keys(VPS_TIERS) as VpsTierKey[]) {
    const tier = VPS_TIERS[tierKey]
    for (const cycleKey of Object.keys(BILLING_CYCLES) as BillingCycle[]) {
      const cycle = tier.cycles[cycleKey]
      const cycleLabel = BILLING_CYCLES[cycleKey].label
      items.push({
        key: `vps:${tierKey}:${cycleKey}`,
        category: 'VPS',
        label: `VPS — ${tier.label} (${cycleLabel})`,
        unitPriceCents: cycle.priceCentsCad,
        currency: 'CAD',
      })
      if (cycle.backupAddonPriceCentsCad) {
        items.push({
          key: `vps:${tierKey}:${cycleKey}:backup`,
          category: 'VPS Add-ons',
          label: `VPS Backup Add-on — ${tier.label} (${cycleLabel})`,
          unitPriceCents: cycle.backupAddonPriceCentsCad,
          currency: 'CAD',
        })
      }
    }
  }

  for (const tierKey of STORAGE_TIER_KEYS) {
    const tier = STORAGE_TIERS[tierKey]
    if (tier.priceCentsCad === 0) continue
    items.push({ key: `storage:${tierKey}`, category: 'X-Drive Storage', label: `X-Drive — ${tier.label} (monthly)`, unitPriceCents: tier.priceCentsCad, currency: 'CAD' })
  }

  return items
}

// Templates are priced individually and stored live in the DB (unlike the
// mostly-fixed tiers above), so they're fetched rather than hardcoded.
export async function getTemplateCatalog(sql: any): Promise<CatalogItem[]> {
  const rows = (await sql`SELECT id, title, price_cents FROM templates ORDER BY title`) as unknown as { id: string; title: string; price_cents: number }[]
  return rows.map((t) => ({ key: `template:${t.id}`, category: 'Templates', label: `Template — ${t.title}`, unitPriceCents: t.price_cents, currency: 'USD' }))
}

export async function getFullCatalog(sql: any): Promise<CatalogItem[]> {
  const templates = await getTemplateCatalog(sql)
  return [...getStaticCatalog(), ...templates]
}
