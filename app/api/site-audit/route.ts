import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { runFreeAudit } from '@/lib/siteAuditChecks'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 45

// The real, gated free tier — login + a verified email required (same
// hasBuilderAccess() gate as the AI builder/Studio, NOT a paid-plan gate:
// core functionality is free with an account, paying only removes
// limits). Runs the full rule-based check set and persists the result so
// the paid deep-dive route can analyze exactly what the user already saw.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    if (!hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the site audit tool' }, { status: 403 })
    }

    const { url: rawUrl } = await req.json().catch(() => ({}))
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return NextResponse.json({ error: 'A website URL is required' }, { status: 400 })
    }

    let startUrl: URL
    try {
      const withScheme = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`
      startUrl = new URL(withScheme)
    } catch {
      return NextResponse.json({ error: "That URL doesn't look valid" }, { status: 400 })
    }
    if (!/^https?:$/.test(startUrl.protocol)) {
      return NextResponse.json({ error: 'Only http/https URLs are supported' }, { status: 400 })
    }

    let findings
    try {
      findings = await runFreeAudit(startUrl, sql)
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Couldn't reach that site — check the URL and try again." }, { status: 400 })
    }

    const auditId = randomUUID()
    await sql`
      INSERT INTO site_audits (id, user_id, url, findings_json)
      VALUES (${auditId}, ${user.id}, ${startUrl.origin}, ${JSON.stringify(findings)})
    `

    return NextResponse.json({ ok: true, auditId, findings })
  } catch (err: any) {
    return errorResponse(err)
  }
}
