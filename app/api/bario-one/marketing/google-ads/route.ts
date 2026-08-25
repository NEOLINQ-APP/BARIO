import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = await sql`
      SELECT * FROM bo_ad_campaigns WHERE organization_id = ${org.id} ORDER BY created_at DESC
    `
    return NextResponse.json({ campaigns: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { name, objective, headline, description, keywords, targetLocations, dailyBudgetCents, finalUrl } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_ad_campaigns (
        id, organization_id, created_by_user_id, name, objective, headline, description,
        keywords_json, target_locations, daily_budget_cents, final_url
      ) VALUES (
        ${id}, ${org.id}, ${user.id}, ${name.trim()}, ${objective || null}, ${headline || null}, ${description || null},
        ${JSON.stringify(Array.isArray(keywords) ? keywords : [])}, ${targetLocations || null},
        ${typeof dailyBudgetCents === 'number' ? dailyBudgetCents : null}, ${finalUrl || null}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
