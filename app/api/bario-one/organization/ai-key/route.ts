import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { OWN_AI_PROVIDERS, isOwnAiProviderKey, setOwnAiKey, clearOwnAiKey } from '@/lib/barioOneOwnAiKey'
import { errorResponse } from '@/lib/errors'

// Bring-your-own AI key for lead research — lets an org skip Bario's
// shared monthly lead-gen quota by paying for their own AI usage
// directly. Owner/admin only (this is billing-adjacent, sensitive
// config). Never returns the raw key back once set — write-only, same
// convention as a password field.
export async function GET() {
  const auth = await requireBoMembership()
  if (auth instanceof NextResponse) return auth
  const { org } = auth

  return NextResponse.json({
    configured: Boolean(org.own_ai_provider),
    provider: org.own_ai_provider,
    providers: OWN_AI_PROVIDERS,
  })
}

export async function POST(req: Request) {
  const auth = await requireBoMembership()
  if (auth instanceof NextResponse) return auth
  const { sql, org, membership } = auth
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can set the AI API key' }, { status: 403 })
  }

  try {
    const { provider, apiKey } = await req.json()
    if (!isOwnAiProviderKey(provider)) {
      return NextResponse.json({ error: `provider must be one of: ${OWN_AI_PROVIDERS.map((p) => p.key).join(', ')}` }, { status: 400 })
    }
    if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return NextResponse.json({ error: 'A valid API key is required' }, { status: 400 })
    }

    await setOwnAiKey(sql, org.id, provider, apiKey.trim())
    return NextResponse.json({ ok: true, provider })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE() {
  const auth = await requireBoMembership()
  if (auth instanceof NextResponse) return auth
  const { sql, org, membership } = auth
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can remove the AI API key' }, { status: 403 })
  }

  await clearOwnAiKey(sql, org.id)
  return NextResponse.json({ ok: true })
}
