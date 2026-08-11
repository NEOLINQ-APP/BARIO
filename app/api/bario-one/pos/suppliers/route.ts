import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoSupplier } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_suppliers WHERE organization_id = ${org.id} ORDER BY name`) as unknown as BoSupplier[]
    return NextResponse.json({ suppliers: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can add suppliers' }, { status: 403 })
    }

    const { name, email, phone, notes } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_suppliers (id, organization_id, name, email, phone, notes)
      VALUES (${id}, ${org.id}, ${name.trim()}, ${email || null}, ${phone || null}, ${notes || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
