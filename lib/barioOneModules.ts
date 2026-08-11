import type { BoOrganization } from '@/lib/db'

export type BoModuleKey = 'crm' | 'invoicing' | 'payments' | 'employees' | 'payroll' | 'pos' | 'ai_assistant' | 'api_webhooks'

export const BO_MODULE_KEYS: BoModuleKey[] = ['crm', 'invoicing', 'payments', 'employees', 'payroll', 'pos', 'ai_assistant', 'api_webhooks']

export type BoModuleConfig = {
  key: BoModuleKey
  name: string
  description: string
  priceCentsCad: number // placeholder — needs a real pricing sign-off before going live, same open item already tracked for VPS/domain pricing
  requires: BoModuleKey[]
  stripePriceEnvVar: string
}

export const BO_MODULES: Record<BoModuleKey, BoModuleConfig> = {
  crm: {
    key: 'crm', name: 'CRM', description: 'Contacts, deal pipelines, custom fields, automations',
    priceCentsCad: 2900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_CRM',
  },
  invoicing: {
    key: 'invoicing', name: 'Invoicing', description: 'Estimates, quotes, invoices, recurring billing',
    priceCentsCad: 1900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_INVOICING',
  },
  payments: {
    key: 'payments', name: 'Payments', description: 'Accept card payments directly on your invoices',
    priceCentsCad: 900, requires: ['invoicing'], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_PAYMENTS',
  },
  employees: {
    key: 'employees', name: 'Employees', description: 'HR profiles, time clock, shift scheduling',
    priceCentsCad: 1900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_EMPLOYEES',
  },
  payroll: {
    key: 'payroll', name: 'Payroll', description: 'Real Canadian payroll runs and pay stubs',
    priceCentsCad: 3900, requires: ['employees'], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_PAYROLL',
  },
  pos: {
    key: 'pos', name: 'POS + Inventory', description: 'Point of sale, products, suppliers, purchase orders',
    priceCentsCad: 2900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_POS',
  },
  ai_assistant: {
    key: 'ai_assistant', name: 'Bario AI', description: 'Ask an AI assistant about your own business data',
    priceCentsCad: 1900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_AI_ASSISTANT',
  },
  api_webhooks: {
    key: 'api_webhooks', name: 'API & Integrations', description: 'API keys, outbound webhooks, CSV export',
    priceCentsCad: 1900, requires: [], stripePriceEnvVar: 'STRIPE_PRICE_BO_MODULE_API_WEBHOOKS',
  },
}

export function getEnabledModules(org: Pick<BoOrganization, 'enabled_modules_json'>): BoModuleKey[] {
  try {
    const parsed = JSON.parse(org.enabled_modules_json || '[]') as string[]
    return parsed.filter((k): k is BoModuleKey => (BO_MODULE_KEYS as string[]).includes(k))
  } catch {
    return []
  }
}

export function hasModule(org: Pick<BoOrganization, 'enabled_modules_json'>, key: BoModuleKey): boolean {
  return getEnabledModules(org).includes(key)
}

// Replaces the old fixed per-plan seat table — a flat function of how many
// modules an org has turned on, so seat capacity scales with what they're
// actually paying for instead of a hardcoded tier constant. null = unlimited.
export function seatLimitForModules(enabledModules: BoModuleKey[]): number | null {
  if (enabledModules.length >= 5) return null
  return 2 + enabledModules.length * 3
}

// Idempotent, lazy: an org with enabled_modules_json = '[]' (pre-dates
// modular packaging, or was created mid-cutover before the new signup flow
// writes a real module selection directly) gets backfilled once — same
// "provision on first touch" shape as ensureDefaultPipeline. A no-op for
// any org that already has modules set.
//
// Backfills to ALL modules, not a plan-derived subset. Every org that
// exists as of this system shipping had genuinely unrestricted access to
// every module regardless of its `plan` string (confirmed — no gating of
// any kind existed before this). Deriving the backfill from the old
// marketing-tier `features` copy instead would silently revoke access to
// features already in live use (this was caught live: a real org actively
// using Payroll and POS had a `plan` whose old marketing copy never listed
// either). "Nobody loses access on cutover day" means exactly that — a
// business only ever loses a module once it deliberately removes it via
// the new self-serve module picker, never automatically.
export async function ensureModulesForOrg(sql: any, org: BoOrganization): Promise<BoOrganization> {
  if (getEnabledModules(org).length > 0) return org

  const json = JSON.stringify(BO_MODULE_KEYS)
  await sql`UPDATE bo_organizations SET enabled_modules_json = ${json}, updated_at = now() WHERE id = ${org.id}`
  return { ...org, enabled_modules_json: json }
}
