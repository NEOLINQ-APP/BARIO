import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'

export async function POST() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT l.id AS listing_id, c.api_key
      FROM spott_listings l
      JOIN spott_connection_credentials c ON c.listing_id = l.id
      WHERE l.organization_id = ${org.id} AND l.sync_status != 'not_connected'
    `) as unknown as { listing_id: string; api_key: string }[]
    const conn = rows[0]
    if (!conn) return NextResponse.json({ error: 'No connected listing' }, { status: 404 })

    // Local revoke happens first and unconditionally — BARIO's own
    // disconnect must succeed even if Spott is unreachable. The
    // best-effort remote revoke below just closes the loop on Spott's
    // side too, so the key can't still be used to call BARIO's API.
    await sql`DELETE FROM spott_connection_credentials WHERE listing_id = ${conn.listing_id}`
    await sql`UPDATE spott_listings SET sync_status = 'not_connected', updated_at = now() WHERE id = ${conn.listing_id}`

    try {
      await fetch(`${SPOTT_BASE_URL}/api/public/crm/integrations/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.api_key}` },
      })
    } catch (e) {
      console.error('Spott-side revoke failed (local disconnect already committed)', e)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
