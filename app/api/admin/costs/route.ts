import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { VPS_TIERS, BILLING_CYCLES } from '@/lib/vpsTiers'
import { errorResponse } from '@/lib/errors'

// Real cost vs. what's charged, for the one genuine reseller product Bario
// has priced so far (VPS, resold from Hetzner) — lets the admin see actual
// margin before deciding how much discount room exists for a coupon.
// Live EUR->CAD rate (frankfurter.app, free/no-key) with a hardcoded
// fallback so this page still works if that's ever unreachable.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    let eurToCad = 1.61
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=CAD', { signal: AbortSignal.timeout(5000) })
      const data = await res.json()
      if (data?.rates?.CAD) eurToCad = data.rates.CAD
    } catch {
      // Keep the fallback rate — a slightly stale rate is fine for a
      // rough margin check, better than failing the whole page.
    }

    const tiers = Object.entries(VPS_TIERS).map(([key, tier]) => {
      const hetznerCostCentsCad = Math.round(tier.hetznerRawCostCentsEur * eurToCad)
      const cycles = Object.entries(tier.cycles).map(([cycleKey, cycle]) => {
        const months = BILLING_CYCLES[cycleKey as keyof typeof BILLING_CYCLES].months
        const totalCostCentsCad = hetznerCostCentsCad * months
        const marginCents = cycle.priceCentsCad - totalCostCentsCad
        return {
          cycle: cycleKey,
          label: BILLING_CYCLES[cycleKey as keyof typeof BILLING_CYCLES].label,
          priceCentsCad: cycle.priceCentsCad,
          rawCostCentsCad: totalCostCentsCad,
          marginCents,
          marginPercent: cycle.priceCentsCad > 0 ? Math.round((marginCents / cycle.priceCentsCad) * 1000) / 10 : 0,
        }
      })
      return {
        key,
        label: tier.label,
        hetznerServerType: tier.hetznerServerType,
        hetznerRawCostCentsEur: tier.hetznerRawCostCentsEur,
        hetznerCostCentsCadPerMonth: hetznerCostCentsCad,
        cycles,
      }
    })

    return NextResponse.json({ ok: true, eurToCad, tiers })
  } catch (err: any) {
    return errorResponse(err)
  }
}
