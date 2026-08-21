import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public, unauthenticated by design — a CASL/CAN-SPAM one-click unsubscribe
// link has to work without asking the recipient to log in. Token-gated
// (lib/barioOneSuppression.ts's getOrCreateUnsubscribeToken) rather than
// customer-id-gated so it isn't a guessable/enumerable identifier.
export const dynamic = 'force-dynamic'

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#1e293b;text-align:center;">
      <h1 style="font-size:20px;">${title}</h1>
      <p style="color:#64748b;">${body}</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (!token) return page('Invalid link', 'This unsubscribe link is missing its token.')

  const sql = await db()
  const rows = (await sql`SELECT id, organization_id, contact_name FROM bo_customers WHERE unsubscribe_token = ${token}`) as unknown as { id: string; organization_id: string; contact_name: string }[]
  const customer = rows[0]
  if (!customer) return page('Invalid link', "This unsubscribe link isn't valid — it may have already been used or the account may no longer exist.")

  await sql`
    UPDATE bo_customers SET do_not_contact = true, do_not_contact_reason = 'Unsubscribed via email link', updated_at = now()
    WHERE id = ${customer.id}
  `
  return page("You're unsubscribed", "You won't receive any more emails from this list. If this was a mistake, just reply to any prior email to be added back.")
}
