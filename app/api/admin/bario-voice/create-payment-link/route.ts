import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One-off Stripe Payment Link generator for Bario Voice collections —
// these aren't real bo_invoices rows (see [[bario_hub_invoices_afc_sunbuilt]]
// in memory), so there's no existing checkout flow to hang a payment link
// off of. This creates a real, hosted Stripe Checkout page for an exact
// amount, with the company name in the product description and metadata
// for later reconciliation against a Stripe payment.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : ''
    const amountCents = typeof body?.amountCents === 'number' ? body.amountCents : null
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const ref = typeof body?.ref === 'string' ? body.ref.trim() : ''
    if (!companyName || !amountCents || amountCents <= 0) {
      return NextResponse.json({ error: 'companyName and a positive amountCents are required' }, { status: 400 })
    }

    const stripe = getStripe()
    const link = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'cad',
            unit_amount: amountCents,
            product_data: {
              name: `Bario Voice — ${companyName}`,
              description: description || undefined,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { company: companyName, ref, purpose: 'bario_voice_reconnection' },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: { custom_message: 'Payment received — your Bario Voice line will be reconnected shortly.' },
      },
    })

    return NextResponse.json({ ok: true, url: link.url, id: link.id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
