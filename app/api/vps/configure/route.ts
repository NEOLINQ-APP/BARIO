import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { isVpsTierKey, isBillingCycle, VPS_REGION } from '@/lib/vpsTiers'
import { recordLegalAcceptance, CURRENT_VPS_POLICY_VERSION } from '@/lib/legal'
import { rateLimit } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

const SSH_KEY_RE = /^(ssh-(rsa|ed25519)|ecdsa-sha2-nistp\d+)\s+[A-Za-z0-9+/]+=*(\s+.*)?$/

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    const { tier, billingCycle, sshPublicKey, wantsPasswordFallback, backupAddon, legalAccepted } = await req.json()

    if (!isVpsTierKey(tier)) {
      return NextResponse.json({ error: 'tier must be one of: small, medium, large' }, { status: 400 })
    }
    if (!isBillingCycle(billingCycle)) {
      return NextResponse.json({ error: 'Invalid billing cycle' }, { status: 400 })
    }

    const hasKey = typeof sshPublicKey === 'string' && sshPublicKey.trim().length > 0
    if (hasKey && wantsPasswordFallback === true) {
      return NextResponse.json({ error: 'Provide an SSH key OR choose the password fallback, not both' }, { status: 400 })
    }
    if (!hasKey && wantsPasswordFallback !== true) {
      return NextResponse.json({ error: 'Provide an SSH public key or choose the one-time password option' }, { status: 400 })
    }
    if (hasKey && !SSH_KEY_RE.test(sshPublicKey.trim())) {
      return NextResponse.json({ error: "That doesn't look like a valid SSH public key" }, { status: 400 })
    }

    if (legalAccepted !== true) {
      return NextResponse.json({ error: 'You must accept the VPS Acceptable Use Policy to continue' }, { status: 400 })
    }

    const allowed = await rateLimit(sql, `vps-order:${user.id}`, 3, 86_400)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many server orders today — please try again tomorrow, or contact support.' }, { status: 429 })
    }

    const forwardedFor = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const legalAcceptanceId = await recordLegalAcceptance(sql, {
      userId: user.id,
      policySlug: 'vps_aup',
      policyVersion: CURRENT_VPS_POLICY_VERSION,
      ip: forwardedFor,
      userAgent: req.headers.get('user-agent'),
    })

    const orderId = randomUUID()
    await sql`
      INSERT INTO vps_instances (id, user_id, tier, billing_cycle, region, ssh_public_key, backup_addon, legal_acceptance_id, status)
      VALUES (${orderId}, ${user.id}, ${tier}, ${billingCycle}, ${VPS_REGION}, ${hasKey ? sshPublicKey.trim() : null}, ${!!backupAddon}, ${legalAcceptanceId}, 'pending_payment')
    `

    return NextResponse.json({ ok: true, orderId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
