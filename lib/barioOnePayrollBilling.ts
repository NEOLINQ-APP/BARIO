import { getStripe, BO_PAYROLL_PER_EMPLOYEE_PRICE_ID } from '@/lib/stripe'
import { hasModule } from '@/lib/barioOneModules'
import type { BoOrganization } from '@/lib/db'

// Deliberately separate from lib/barioOnePayroll.ts (the real CRA/RQ tax
// calculation + pay stub PDF module) — this file is just the Stripe
// billing side of the Payroll add-on (base + per-employee metered price),
// unrelated to how pay is actually calculated.

export async function getEmployeeCount(sql: any, orgId: string): Promise<number> {
  const rows = (await sql`SELECT count(*)::int AS count FROM bo_employees WHERE organization_id = ${orgId}`) as unknown as { count: number }[]
  return rows[0]?.count ?? 0
}

// Keeps the per-employee Stripe subscription item's quantity matched to
// real headcount whenever an employee is added or removed. Cheap no-op for
// every org that doesn't have payroll enabled or isn't on a real
// subscription yet — call this unconditionally after any employee
// create/delete, same "just call it, it decides whether there's anything
// to do" shape as triggerWebhooks/runAutomations elsewhere in Bario One.
export async function syncPayrollQuantity(sql: any, org: BoOrganization): Promise<void> {
  if (!org.stripe_subscription_id || !BO_PAYROLL_PER_EMPLOYEE_PRICE_ID) return
  if (!hasModule(org, 'payroll')) return

  const stripe = getStripe()
  const items = await stripe.subscriptionItems.list({ subscription: org.stripe_subscription_id, limit: 100 })
  const perEmployeeItem = items.data.find((i) => i.price.id === BO_PAYROLL_PER_EMPLOYEE_PRICE_ID)
  if (!perEmployeeItem) return

  const count = await getEmployeeCount(sql, org.id)
  if (perEmployeeItem.quantity !== count) {
    await stripe.subscriptionItems.update(perEmployeeItem.id, { quantity: count })
  }
}
