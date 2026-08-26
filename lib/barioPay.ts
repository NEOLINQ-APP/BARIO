import { getStripe } from './stripe'

// A single, dedicated Stripe Customer represents "Bario's own vendor
// billing wallet" -- not any real customer's account. Cards saved here
// (via Stripe Elements SetupIntent, never touching Bario's own servers
// in raw form) are Sherwin's own payment methods for paying Bario's
// vendor bills, kept intentionally separate from any customer-facing
// Stripe Customer object elsewhere in the codebase.
const SETTINGS_KEY = 'bario_pay_stripe_customer_id'

export async function getOrCreateBarioPayCustomerId(sql: any): Promise<string> {
  const [row] = (await sql`SELECT value FROM platform_settings WHERE key = ${SETTINGS_KEY}`) as { value: string }[]
  if (row?.value) return row.value

  const customer = await getStripe().customers.create({
    name: 'Bario — Internal Vendor Billing',
    metadata: { purpose: 'bario_pay_internal' },
  })
  await sql`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (${SETTINGS_KEY}, ${customer.id}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${customer.id}, updated_at = now()
  `
  return customer.id
}

// Bill status precedence for the color dot: an explicit 'suspended' or
// 'warning' always wins over a due-date-derived color, since a due date
// three weeks out doesn't mean much if the vendor already cut the
// service off. Only 'active' bills get the due-soon/flashing treatment.
export type BillDisplayStatus = 'red' | 'yellow' | 'orange' | 'green'

export function computeDisplayStatus(status: string, dueDate: string | null): { color: BillDisplayStatus; flashing: boolean } {
  if (status === 'suspended') return { color: 'red', flashing: false }
  if (status === 'warning') return { color: 'yellow', flashing: false }

  if (dueDate) {
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 7) return { color: 'orange', flashing: true }
    if (daysUntil <= 14) return { color: 'orange', flashing: false }
  }
  return { color: 'green', flashing: false }
}
