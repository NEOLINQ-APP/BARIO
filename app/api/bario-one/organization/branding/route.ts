import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Writes the columns generateBoInvoicePdf() and the public invoice view
// already read (org.business_address/phone/email/tax_number) but that have
// had no write path anywhere since they were added — see the "Bario Invoice"
// schema comment in lib/db.ts. Any member can view, only owner/admin can edit,
// same role split as every other org-settings-style route (e.g. invoice DELETE).
export async function PATCH(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can edit company info' }, { status: 403 })
    }

    const { businessAddress, businessPhone, businessEmail, taxNumber } = await req.json()

    await sql`
      UPDATE bo_organizations SET
        business_address = ${typeof businessAddress === 'string' ? businessAddress.trim() || null : null},
        business_phone = ${typeof businessPhone === 'string' ? businessPhone.trim() || null : null},
        business_email = ${typeof businessEmail === 'string' ? businessEmail.trim() || null : null},
        tax_number = ${typeof taxNumber === 'string' ? taxNumber.trim() || null : null},
        updated_at = now()
      WHERE id = ${org.id}
    `

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
