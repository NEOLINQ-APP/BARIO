import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { CrmStack } from '@/lib/db'
import { decryptPassword } from '@/lib/vpsPassword'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Unlike app/api/vps/[id]/reveal-password (one-time, nulls the ciphertext
// after reveal), this is a recurring login the admin needs repeatedly, so
// the ciphertext is never destroyed — every reveal is logged instead, same
// audit-trail principle applied differently since the access pattern is
// different (repeat use vs. one-time initial handoff).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM crm_stacks WHERE id = ${params.id}`) as unknown as CrmStack[]
    const stack = rows[0]
    if (!stack) return NextResponse.json({ error: 'CRM workspace not found' }, { status: 404 })
    if (!stack.login_password_encrypted || !stack.login_password_iv) {
      return NextResponse.json({ error: 'No password on file for this workspace yet' }, { status: 400 })
    }

    const password = decryptPassword(stack.login_password_encrypted, stack.login_password_iv)
    await logAdminAction(sql, { action: 'crm-stack-reveal-password', params: { crmStackId: stack.id, slug: stack.slug }, result: 'ok' })

    return NextResponse.json({ ok: true, password })
  } catch (err) {
    return errorResponse(err)
  }
}
