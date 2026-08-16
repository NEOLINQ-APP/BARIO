import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { CrmStack } from '@/lib/db'
import { encryptPassword } from '@/lib/vpsPassword'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Stores (or updates) the login password used for quick-access on
// /admin/client-crms. Same interim-manual-step shape as the api-key route
// next to this one — log into the workspace once with whatever password it
// actually has, then POST it here so it's available for one-click reveal
// going forward.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { password } = await req.json()
    if (typeof password !== 'string' || !password.trim()) {
      return NextResponse.json({ error: 'password is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT * FROM crm_stacks WHERE id = ${params.id}`) as unknown as CrmStack[]
    const stack = rows[0]
    if (!stack) return NextResponse.json({ error: 'CRM workspace not found' }, { status: 404 })

    const { ciphertext, iv } = encryptPassword(password.trim())
    await sql`
      UPDATE crm_stacks SET login_password_encrypted = ${ciphertext}, login_password_iv = ${iv}, updated_at = now()
      WHERE id = ${stack.id}
    `

    await logAdminAction(sql, { action: 'crm-stack-set-password', params: { crmStackId: stack.id, slug: stack.slug }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
