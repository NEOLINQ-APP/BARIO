import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { isInvoiceThemeKey, parseFieldToggles, type InvoiceFieldToggles } from '@/lib/barioOneInvoiceThemes'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can change document design' }, { status: 403 })
    }

    const { themeKey, primaryColor, fieldToggles } = (await req.json()) as {
      themeKey?: string
      primaryColor?: string
      fieldToggles?: Partial<InvoiceFieldToggles>
    }

    const theme = isInvoiceThemeKey(themeKey) ? themeKey : org.invoice_theme_key
    const color = typeof primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : org.branding_primary_color
    const toggles =
      fieldToggles && typeof fieldToggles === 'object'
        ? JSON.stringify({ ...parseFieldToggles(org.invoice_field_toggles_json), ...fieldToggles })
        : org.invoice_field_toggles_json

    await sql`
      UPDATE bo_organizations SET
        invoice_theme_key = ${theme},
        branding_primary_color = ${color},
        invoice_field_toggles_json = ${toggles},
        updated_at = now()
      WHERE id = ${org.id}
    `

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
