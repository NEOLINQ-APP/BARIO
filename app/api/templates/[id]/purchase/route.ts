import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type Template } from '@/lib/db'
import { hasZeusStudioAccess, hasPaidPlan } from '@/lib/access'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One-time purchase of a single premium template, as an alternative to a
// full paid plan — mode: 'payment' (not 'subscription'), so it never touches
// the user's plan/subscription_status. The webhook records the purchase as
// a template_licenses row once payment actually completes.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use templates' }, { status: 403 })
    }

    const rows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
    const template = rows[0]
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (!template.is_premium) return NextResponse.json({ error: 'This template is already free to use' }, { status: 400 })
    if (hasPaidPlan(user)) return NextResponse.json({ error: 'Your plan already includes every premium template' }, { status: 400 })

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id, templateId: template.id },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: template.price_cents,
          product_data: { name: `Bario Template: ${template.title}` },
        },
        quantity: 1,
      }],
      success_url: `${origin}/build/templates/${template.id}?purchased=1`,
      cancel_url: `${origin}/build/templates/${template.id}`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
