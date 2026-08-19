import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { researchLeads, researchLeadsDebug, addLeadsToOrg } from '@/lib/barioOneAssistantTools'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { BoOrganization } from '@/lib/db'

// Admin-triggered lead research for a house account's own CRM (e.g.
// Bario.ca's, Unique Group's) — deliberately separate from the customer-
// facing find_new_leads tool in lib/barioOneAssistantTools.ts, which is
// still held off (LEAD_GEN_LIVE = false) pending the not-yet-live per-tier
// pricing update. That kill switch protects paying-customer orgs from
// spending real Anthropic/web-search cost for free; it was never meant to
// block Bario's own internal use of the same research capability on its
// own account. Reuses the exact same researchLeads()/addLeadsToOrg() the
// customer tool uses — no separate logic to drift out of sync.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { query, count, debug } = await req.json()
    const trimmedQuery = String(query || '').trim()
    if (!trimmedQuery) return NextResponse.json({ error: 'query is required' }, { status: 400 })
    const resolvedCount = Number.isFinite(count) ? Math.min(Math.max(Math.round(count), 1), 10) : 5

    if (debug) {
      try {
        const leads = await researchLeadsDebug(trimmedQuery, resolvedCount)
        return NextResponse.json({ ok: true, debug: true, leads })
      } catch (err: any) {
        return NextResponse.json({ ok: false, debug: true, error: err?.message || String(err) }, { status: 500 })
      }
    }

    const leads = await researchLeads(trimmedQuery, resolvedCount)
    if (leads.length === 0) {
      return NextResponse.json({ error: 'Could not find any real leads matching that — try a broader or more specific search.' }, { status: 404 })
    }

    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    const orgName = orgRows[0]?.name

    const added = await addLeadsToOrg(sql, params.id, leads, orgName)

    await logAdminAction(sql, {
      action: 'bario_one_admin_generate_leads',
      params: { orgId: params.id, query: trimmedQuery, requestedCount: resolvedCount, addedCount: added.length },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, addedCount: added.length, leads: added.map((a) => a.customer) })
  } catch (err) {
    return errorResponse(err)
  }
}
