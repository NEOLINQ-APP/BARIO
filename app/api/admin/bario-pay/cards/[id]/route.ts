import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = (await sql`SELECT stripe_payment_method_id FROM bario_pay_cards WHERE id = ${params.id}`) as unknown as { stripe_payment_method_id: string }[]
    const card = rows[0]
    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    await sql`UPDATE bario_pay_bills SET card_id = NULL WHERE card_id = ${params.id}`
    await sql`DELETE FROM bario_pay_cards WHERE id = ${params.id}`
    await getStripe().paymentMethods.detach(card.stripe_payment_method_id).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
