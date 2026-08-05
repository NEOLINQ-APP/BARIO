import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type VpsInstance } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One-time fee to convert a finished 'wordpress' app_type VPS to a static
// Bario site and cancel the VPS hosting. Deliberately does NOT run the
// crawl itself — the customer already ran the existing, proven
// /api/sites/migrate against their live WordPress site (same feature used
// for ayoshermo.com/sunbuiltgroup.com) and reviewed the result BEFORE
// paying to cancel their hosting, so this route only ever fires once
// they've confirmed the static copy looks right.
const CONVERT_FEE_CENTS_CAD = 1000 // $10 CAD — see plan's "confirm real pricing before launch" note, same placeholder-pricing gap as VPS_TIERS itself

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${params.id} AND user_id = ${user.id}`) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    if (order.app_type !== 'wordpress') return NextResponse.json({ error: 'This server was not set up with WordPress' }, { status: 400 })
    if (order.status !== 'active') return NextResponse.json({ error: 'This server is not active' }, { status: 400 })
    if (!order.stripe_subscription_id) return NextResponse.json({ error: 'No active subscription found for this server' }, { status: 400 })

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { userId: user.id, convertVpsId: order.id },
      line_items: [{
        price_data: {
          currency: 'cad',
          unit_amount: CONVERT_FEE_CENTS_CAD,
          product_data: { name: 'Convert WordPress site to static hosting & cancel server' },
        },
        quantity: 1,
      }],
      success_url: `${origin}/dashboard/servers?converted=1`,
      cancel_url: `${origin}/dashboard/servers`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
