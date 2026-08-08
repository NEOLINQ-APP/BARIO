import { randomUUID, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import { logAdminAction } from '@/lib/adminActions'

// One-time provisioning route: creates the real Bario logins for AFC
// Logistics and Sunbuilt Group so they can use the Requests portal, and
// links them via client_companies. Safe to call more than once — skips any
// account that already exists rather than erroring.
const COMPANIES = [
  { email: 'admin@afclogistics.ca', companyKey: 'afc_logistics', companyLabel: 'AFC Logistics' },
  { email: 'admin@sunbuiltgroup.com', companyKey: 'sunbuilt_group', companyLabel: 'Sunbuilt Group' },
]

export async function POST(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const results: { email: string; companyLabel: string; created: boolean; password?: string }[] = []

    for (const c of COMPANIES) {
      const existing = (await sql`SELECT id FROM users WHERE email = ${c.email}`) as unknown as { id: string }[]
      let userId = existing[0]?.id
      let password: string | undefined

      if (!userId) {
        password = randomBytes(12).toString('base64url')
        const passwordHash = await bcrypt.hash(password, 10)
        userId = randomUUID()
        await sql`
          INSERT INTO users (id, email, password_hash, email_verified)
          VALUES (${userId}, ${c.email}, ${passwordHash}, true)
        `
      }

      await sql`
        INSERT INTO client_companies (user_id, company_key, company_label)
        VALUES (${userId}, ${c.companyKey}, ${c.companyLabel})
        ON CONFLICT (user_id) DO NOTHING
      `

      results.push({ email: c.email, companyLabel: c.companyLabel, created: !!password, password })
    }

    await logAdminAction(sql, { action: 'seed_client_companies', result: 'ok', params: { companies: COMPANIES.map((c) => c.email) } })

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return errorResponse(err)
  }
}
