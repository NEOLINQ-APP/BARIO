import { createHmac, timingSafeEqual } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { findUserByPageId } from '@/lib/social/connections'
import { sendSms } from '@/lib/twilio'

// Step 1 of Meta's webhook setup: they GET this URL with a challenge and
// expect it echoed back verbatim, but only if hub.verify_token matches what
// you configured in the App Dashboard — this is the one thing standing
// between "Meta's webhook" and "anyone who found this URL and wants to
// subscribe it to something."
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const provided = signatureHeader.slice('sha256='.length)
  // Buffers must be equal length for timingSafeEqual — a length mismatch
  // means "not a match" the same as a byte mismatch, not a thrown error.
  const expectedBuf = Buffer.from(expected, 'hex')
  const providedBuf = Buffer.from(provided, 'hex')
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf)
}

async function fetchFullLead(leadgenId: string, pageAccessToken: string) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${pageAccessToken}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch lead details from Meta')
  return data as { field_data: { name: string; values: string[] }[] }
}

function extractField(fieldData: { name: string; values: string[] }[], keys: string[]): string | null {
  for (const key of keys) {
    const field = fieldData.find((f) => f.name.toLowerCase() === key)
    if (field?.values?.[0]) return field.values[0]
  }
  return null
}

// Meta's webhook payload only ever carries IDs (leadgen_id, page_id,
// form_id) — never the lead's actual contact info, which has to be fetched
// back out via a second Graph API call using that Page's stored access
// token. This is real, working "instant lead capture": webhook -> fetch
// full lead -> store -> SMS the business owner, typically within a couple
// seconds of the form submit, same shape the spec asked for.
export async function POST(req: Request) {
  const rawBody = await req.text()
  if (!verifySignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const sql = await db()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue
      const { leadgen_id: leadgenId, page_id: pageId } = change.value ?? {}
      if (!leadgenId || !pageId) continue

      try {
        const owner = await findUserByPageId(sql, pageId)
        if (!owner) continue // Page isn't connected to any Bario account — nothing to do.

        const lead = await fetchFullLead(leadgenId, owner.access_token)
        const fullName = extractField(lead.field_data, ['full_name', 'name'])
        const email = extractField(lead.field_data, ['email'])
        const phone = extractField(lead.field_data, ['phone_number', 'phone'])

        const inserted = (await sql`
          INSERT INTO social_leads (id, user_id, platform, external_lead_id, full_name, email, phone, raw_json, created_at)
          VALUES (${randomUUID()}, ${owner.user_id}, 'facebook', ${leadgenId}, ${fullName}, ${email}, ${phone}, ${JSON.stringify(lead)}, now())
          ON CONFLICT (platform, external_lead_id) DO NOTHING
          RETURNING id
        `) as unknown as { id: string }[]
        if (!inserted[0]) continue // Duplicate delivery — Meta retries webhooks, so this is expected, not an error.

        if (owner.notify_phone) {
          await sendSms(
            owner.notify_phone,
            `New lead from your ad!${fullName ? ` ${fullName}` : ''}${phone ? ` — ${phone}` : ''}${email ? ` — ${email}` : ''}`
          )
          await sql`UPDATE social_leads SET notified = true WHERE id = ${inserted[0].id}`
        }
      } catch (err) {
        // One bad lead shouldn't stop the rest of the batch — Meta doesn't
        // retry on a 200, and other entries in the same payload are
        // unrelated leads that shouldn't be dropped because of this one.
        console.error('social webhook meta: failed to process lead', leadgenId, err)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
