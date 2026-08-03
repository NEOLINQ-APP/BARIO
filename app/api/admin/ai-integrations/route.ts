import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { AiIntegration } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const integrations = (await sql`SELECT * FROM ai_integrations ORDER BY name`) as unknown as AiIntegration[]
    return NextResponse.json({ ok: true, integrations })
  } catch (err) {
    return errorResponse(err)
  }
}
