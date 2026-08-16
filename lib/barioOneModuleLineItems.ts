import { BO_MODULE_PRICE_IDS, BO_PAYROLL_BASE_PRICE_ID, BO_PAYROLL_PER_EMPLOYEE_PRICE_ID } from '@/lib/stripe'
import type { BoModuleKey } from '@/lib/barioOneModules'
import { getEmployeeCount } from '@/lib/barioOnePayrollBilling'

export type BoLineItem = { price: string; quantity: number }

// Builds the Stripe line items for a resolved module set — shared by both
// the checkout and update routes so the payroll/payments special-casing
// only lives in one place. 'payments' is free (see the comment on
// BO_MODULES.payments in lib/barioOneModules.ts) and never gets a line
// item. 'payroll' needs two line items (flat base + per-employee, quantity
// = current headcount) since Stripe has no single "flat fee + per-unit"
// recurring price.
export async function buildModuleLineItems(
  sql: any,
  orgId: string,
  resolvedKeys: BoModuleKey[]
): Promise<{ lineItems: BoLineItem[] } | { error: string }> {
  const lineItems: BoLineItem[] = []
  for (const key of resolvedKeys) {
    if (key === 'payments') continue
    if (key === 'payroll') {
      if (!BO_PAYROLL_BASE_PRICE_ID || !BO_PAYROLL_PER_EMPLOYEE_PRICE_ID) {
        return { error: 'The payroll module isn\'t available for purchase right now' }
      }
      const employeeCount = await getEmployeeCount(sql, orgId)
      lineItems.push({ price: BO_PAYROLL_BASE_PRICE_ID, quantity: 1 })
      lineItems.push({ price: BO_PAYROLL_PER_EMPLOYEE_PRICE_ID, quantity: employeeCount })
      continue
    }
    const priceId = BO_MODULE_PRICE_IDS[key]
    if (!priceId) return { error: `The ${key} module isn't available for purchase right now` }
    lineItems.push({ price: priceId, quantity: 1 })
  }
  return { lineItems }
}

// Which of the resolved module keys already have a live line item on this
// subscription — payroll checked via either of its two prices being
// present (both always added/removed together), everything else via its
// single price. Used by the update route to diff desired vs. current state.
export function moduleKeysCurrentlyBilled(currentPriceIds: Set<string>, candidateKeys: BoModuleKey[]): BoModuleKey[] {
  return candidateKeys.filter((key) => {
    if (key === 'payments') return true // always considered "current" — never billed, never needs adding/removing
    if (key === 'payroll') {
      return Boolean(
        (BO_PAYROLL_BASE_PRICE_ID && currentPriceIds.has(BO_PAYROLL_BASE_PRICE_ID)) ||
          (BO_PAYROLL_PER_EMPLOYEE_PRICE_ID && currentPriceIds.has(BO_PAYROLL_PER_EMPLOYEE_PRICE_ID))
      )
    }
    const priceId = BO_MODULE_PRICE_IDS[key]
    return Boolean(priceId && currentPriceIds.has(priceId))
  })
}
