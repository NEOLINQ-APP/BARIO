import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { findDialerBusiness } from '@/lib/dialerBusinesses'
import { verifyDialerPasscode } from '@/lib/dialerAccess'
import { errorResponse } from '@/lib/errors'
import { BARIO_ONE_CALL_LOG_ORG_IDS, findOrCreateBoCustomerByPhone } from '@/lib/barioOneCrmCallLog'

// Bario Dialer's call history. The call itself happens entirely
// browser-to-Twilio (Voice SDK/WebRTC) — this just logs it from the
// client at the two real lifecycle moments: POST when a call starts,
// PATCH when it ends with however long it actually ran.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const businessKey = url.searchParams.get('businessKey')

  let sql: Awaited<ReturnType<typeof db>>
  if (verifyDialerPasscode(req, businessKey)) {
    sql = await db()
  } else {
    const adminOrRes = await requireAdmin(req)
    if (adminOrRes instanceof NextResponse) return adminOrRes
    sql = adminOrRes.sql
  }

  try {
    const rows = businessKey
      ? await sql`SELECT * FROM dialer_call_log WHERE business_key = ${businessKey} ORDER BY started_at DESC LIMIT 50`
      : await sql`SELECT * FROM dialer_call_log ORDER BY started_at DESC LIMIT 50`
    return NextResponse.json({ ok: true, calls: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : null
  const toNumber = typeof body?.toNumber === 'string' ? body.toNumber : null
  const contactName = typeof body?.contactName === 'string' ? body.contactName : null
  if (!businessKey || !toNumber) {
    return NextResponse.json({ error: 'businessKey and toNumber are required' }, { status: 400 })
  }

  const viaPasscode = verifyDialerPasscode(req, businessKey)
  let placedBy: string | null = null
  let sql: Awaited<ReturnType<typeof db>>
  if (viaPasscode) {
    sql = await db()
  } else {
    const adminOrRes = await requireAdmin(req)
    if (adminOrRes instanceof NextResponse) return adminOrRes
    if (!adminOrRes.user) {
      return NextResponse.json({ error: 'A real admin session (not the API key) is needed to attribute the call' }, { status: 400 })
    }
    sql = adminOrRes.sql
    placedBy = adminOrRes.user.id
  }

  try {
    const id = randomUUID()
    const placedByLabel = viaPasscode ? `${findDialerBusiness(businessKey)?.businessName ?? businessKey} client dialer` : null
    await sql`
      INSERT INTO dialer_call_log (id, business_key, placed_by, placed_by_label, to_number, contact_name)
      VALUES (${id}, ${businessKey}, ${placedBy}, ${placedByLabel}, ${toNumber}, ${contactName})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Logs a real Dialer call (human staff, not Victoria) into the same CRM a
// Victoria call would land in — reuses the exact write-path primitive
// (findOrCreateBoCustomerByPhone), but with its own note title/kind so it's
// never mistaken for one of Victoria's AI-handled calls when a staff member
// reads it back later.
async function logDialerCallToCrm(sql: Awaited<ReturnType<typeof db>>, opts: {
  businessKey: string
  toNumber: string
  contactName: string | null
  durationSeconds: number
}) {
  const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[opts.businessKey]
  if (!orgId) return // e.g. 'mom' has no business CRM behind it
  const digits = opts.toNumber.replace(/\D/g, '')
  if (digits.length < 10) return // placeholder/unknown number, nothing real to log

  const customerId = await findOrCreateBoCustomerByPhone(sql, orgId, opts.toNumber, opts.contactName)
  if (!customerId) return

  const when = new Date().toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' })
  const body = `Dialer call — ${when}\n\n${opts.durationSeconds}s call via the Bario Dialer.`
  await sql`
    INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
    VALUES (${randomUUID()}, ${orgId}, ${customerId}, 'call', ${body})
  `
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : null
  const businessKey = typeof body?.businessKey === 'string' ? body.businessKey : null
  const status = typeof body?.status === 'string' ? body.status : 'completed'
  const durationSeconds = Number.isFinite(body?.durationSeconds) ? Math.max(0, Math.round(body.durationSeconds)) : 0
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let sql: Awaited<ReturnType<typeof db>>
  if (verifyDialerPasscode(req, businessKey)) {
    sql = await db()
  } else {
    const adminOrRes = await requireAdmin(req)
    if (adminOrRes instanceof NextResponse) return adminOrRes
    sql = adminOrRes.sql
  }

  try {
    // businessKey (when passcode-verified) additionally scopes the update so
    // an AFC passcode can only ever touch AFC's own call-log rows.
    const rows = businessKey
      ? await sql`
          UPDATE dialer_call_log SET status = ${status}, duration_seconds = ${durationSeconds}, ended_at = now()
          WHERE id = ${id} AND business_key = ${businessKey}
          RETURNING business_key, to_number, contact_name
        `
      : await sql`
          UPDATE dialer_call_log SET status = ${status}, duration_seconds = ${durationSeconds}, ended_at = now()
          WHERE id = ${id}
          RETURNING business_key, to_number, contact_name
        `

    // Only a call that actually connected is a real CRM-worthy interaction —
    // a cancelled/rejected/failed attempt never reached a person.
    const row = (rows as any[])[0]
    if (row && status === 'completed') {
      try {
        await logDialerCallToCrm(sql, {
          businessKey: row.business_key,
          toNumber: row.to_number,
          contactName: row.contact_name,
          durationSeconds,
        })
      } catch (err) {
        // Never let a CRM-logging failure break the call-log update itself.
        console.error('Dialer CRM call logging failed', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
