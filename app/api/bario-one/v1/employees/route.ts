import { NextResponse } from 'next/server'
import { requireBoApiKey } from '@/lib/barioOneApiAuth'
import type { BoEmployee } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Read-only, and deliberately excludes pay rates/documents — HR/payroll
// figures don't need external API exposure for a v1, unlike customers/
// invoices/products which are the actual integration use cases (synced
// to accounting software, e-commerce, etc.).
export async function GET(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const rows = (await sql`SELECT * FROM bo_employees WHERE organization_id = ${org.id} ORDER BY name`) as unknown as BoEmployee[]
    return NextResponse.json({
      employees: rows.map((e) => ({ id: e.id, name: e.name, position: e.position, status: e.status })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
