import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type VpsInstance } from '@/lib/db'
import { decryptPassword } from '@/lib/vpsPassword'
import { errorResponse } from '@/lib/errors'

// One-time reveal — decrypts and returns the root password, then nulls the
// ciphertext column in the same request so a second reveal is structurally
// impossible, not just hidden by the UI.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`
      SELECT * FROM vps_instances WHERE id = ${params.id} AND user_id = ${session.userId}
    `) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    if (!order.root_password_ciphertext || !order.root_password_iv) {
      return NextResponse.json({ error: 'No password available — either an SSH key was used, or it was already revealed.' }, { status: 400 })
    }

    const password = decryptPassword(order.root_password_ciphertext, order.root_password_iv)
    await sql`
      UPDATE vps_instances SET root_password_ciphertext = NULL, root_password_iv = NULL, root_password_revealed_at = now(), updated_at = now()
      WHERE id = ${params.id}
    `

    return NextResponse.json({ ok: true, password })
  } catch (err: any) {
    return errorResponse(err)
  }
}
