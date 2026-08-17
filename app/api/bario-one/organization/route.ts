import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { getActiveOrgForUser, listOrgMembers } from '@/lib/barioOne'
import { BO_PLANS } from '@/lib/barioOneTiers'
import { ensureModulesForOrg, getEnabledModules, seatLimitForModules } from '@/lib/barioOneModules'
import { parseFieldToggles } from '@/lib/barioOneInvoiceThemes'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const found = await getActiveOrgForUser(sql, session.userId)
    if (!found) return NextResponse.json({ org: null })

    const { membership } = found
    const org = await ensureModulesForOrg(sql, found.org)
    const members = await listOrgMembers(sql, org.id)
    const plan = BO_PLANS[org.plan]
    const enabledModules = getEnabledModules(org)

    return NextResponse.json({
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        planName: plan.name,
        enabledModules,
        seatLimit: seatLimitForModules(enabledModules),
        subscriptionStatus: org.subscription_status,
        trialEndsAt: org.trial_ends_at,
        hasLiveBilling: Boolean(org.stripe_subscription_id),
        brandingPrimaryColor: org.branding_primary_color,
        brandingLogoUrl: org.branding_logo_url,
        businessAddress: org.business_address,
        businessPhone: org.business_phone,
        businessEmail: org.business_email,
        taxNumber: org.tax_number,
        invoiceThemeKey: org.invoice_theme_key,
        invoiceFieldToggles: parseFieldToggles(org.invoice_field_toggles_json),
      },
      myRole: membership.role,
      members: members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        email: m.email ?? m.invited_email,
        role: m.role,
        status: m.status,
      })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
