import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User, type Template } from '@/lib/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const templateRows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
    const template = templateRows[0]
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { kind: 'template_license', templateId: template.id, userId: user.id },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bario Template License — ${template.title}`,
              description: 'Per-site license. Approval required before activation.',
            },
            unit_amount: template.price_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/build/templates/${template.id}?purchase=pending`,
      cancel_url: `${origin}/build/templates/${template.id}`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
