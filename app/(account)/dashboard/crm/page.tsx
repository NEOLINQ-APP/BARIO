import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser, createOrganizationWithOwner } from '@/lib/barioOne'
import { hasModule, ensureModulesForOrg } from '@/lib/barioOneModules'

export const dynamic = 'force-dynamic'

// Twenty CRM (the dedicated-per-customer Docker stack this page used to
// provision) was fully decommissioned 2026-08-20 — zero real external
// customers had ever completed self-serve signup through it (confirmed via
// crm_stacks before removal), so there was nothing to migrate on this
// path specifically. This URL now routes straight into Bario One's own
// CRM instead: same "you land here and have a working CRM" promise, just
// backed by bo_customers/bo_deals rather than a several-minute Twenty
// provision, and with no separate infrastructure to run per customer.
export default async function CrmPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  const active = await getActiveOrgForUser(sql, user.id)
  if (active) {
    const org = await ensureModulesForOrg(sql, active.org)
    if (hasModule(org, 'crm')) redirect('/dashboard/bario-one/crm')
    // Already has a Bario One org, just not the CRM module — send them to
    // Bario One's own dashboard, which already has the real module
    // upgrade/enable UX; not reinvented here.
    redirect('/dashboard/bario-one')
  }

  // No Bario One organization yet at all — auto-create one with the crm
  // module on the same 14-day no-card trial every self-serve signup gets,
  // so this legacy URL still hands the customer working CRM access
  // immediately instead of a dead end.
  await createOrganizationWithOwner(sql, user.id, `${user.email.split('@')[0]}'s Business`, ['crm'])
  redirect('/dashboard/bario-one/crm')
}
