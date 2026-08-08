import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { createBoApiKey, listBoApiKeys, revokeBoApiKey } from '@/lib/barioOneApiKeys'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const keys = (await listBoApiKeys(sql, org.id)).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      revoked: !!k.revoked_at,
    }))
    return NextResponse.json({ keys })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Owner-only — same posture as Stripe Connect onboarding: issuing a
// credential that can act on the business's data is a financial/security
// decision, not a day-to-day admin task.
export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can create API keys' }, { status: 403 })
    }

    const { name } = await req.json().catch(() => ({}))
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'API key'

    const { id, rawKey } = await createBoApiKey(sql, org.id, user.id, cleanName)
    return NextResponse.json({ ok: true, id, rawKey })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can revoke API keys' }, { status: 403 })
    }

    const keyId = new URL(req.url).searchParams.get('id')
    if (!keyId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await revokeBoApiKey(sql, org.id, keyId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
