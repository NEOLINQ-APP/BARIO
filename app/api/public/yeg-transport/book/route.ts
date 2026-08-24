import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

// Real booking intake + deposit payment for yegtransport.ca (hosted on
// bario.ca). A $50 CAD deposit via Stripe confirms the booking slot --
// full job pricing depends on dispatcher review of the actual cargo/route
// (matches the page's own copy: "requests are reviewed... before final
// confirmation"), so this deliberately isn't a full-price charge.
const DEPOSIT_CENTS = 5000
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'surewinmendoza.ca@gmail.com'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      service, pickupDate, pickupTime, customerName, phone, email,
      pickupAddress, deliveryAddress, weight, details,
    } = body

    if (!customerName || !phone || !email || !pickupAddress || !deliveryAddress) {
      return NextResponse.json({ error: 'Missing required booking fields' }, { status: 400 })
    }

    const summary = `
      <h2>New YEG Transport booking request</h2>
      <p><strong>Service:</strong> ${service || 'Not specified'}</p>
      <p><strong>Pickup:</strong> ${pickupDate || '?'} at ${pickupTime || '?'}</p>
      <p><strong>Customer:</strong> ${customerName} — ${phone} — ${email}</p>
      <p><strong>Pickup address:</strong> ${pickupAddress}</p>
      <p><strong>Delivery address:</strong> ${deliveryAddress}</p>
      <p><strong>Weight/units:</strong> ${weight || 'Not specified'}</p>
      <p><strong>Details:</strong><br/>${(details || 'None provided').replace(/\n/g, '<br/>')}</p>
      <p>A $50 CAD deposit checkout was created for this request.</p>
    `
    // Best-effort -- a notification failure shouldn't block real payment collection.
    sendEmail(ADMIN_NOTIFY_EMAIL, `New YEG Transport booking: ${customerName}`, summary).catch((e) =>
      console.error('yeg-transport booking notify failed', e?.message),
    )

    const origin = req.headers.get('origin') || 'https://www.bario.ca'
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'cad',
            unit_amount: DEPOSIT_CENTS,
            product_data: {
              name: 'YEG Transport — Booking Deposit',
              description: `${service || 'Booking'} — confirms your requested slot, dispatcher will follow up to finalize pricing`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        source: 'yeg-transport-booking',
        customerName, phone, email,
        pickupAddress, deliveryAddress,
        pickupDate: pickupDate || '', pickupTime: pickupTime || '',
        service: service || '', weight: weight || '',
      },
      success_url: `${origin}/?booked=1#book`,
      cancel_url: `${origin}/#book`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
