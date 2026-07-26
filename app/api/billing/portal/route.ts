import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One shared Stripe customer per account covers both the site plan and any
// storage subscription, so a single billing-portal session lets someone
// manage or cancel either from one place.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found yet' }, { status: 400 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${origin}/media`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
