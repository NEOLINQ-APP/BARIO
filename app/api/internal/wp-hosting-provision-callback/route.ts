import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applyWpSharedProvisionResult } from '@/lib/wpSharedProvision'

// Called by a hosting node's wp-node-agent once it actually knows whether
// a site it accepted (202) via POST /sites really succeeded — same
// "VPS-side service reports back to BARIO" shape already used elsewhere
// in this project (e.g. Voice Agent's /api/internal/voice-agent-lead).
// Bearer-gated on a shared secret distinct from any individual node's own
// agent_api_token, since this endpoint isn't scoped to one node.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.WP_HOSTING_CALLBACK_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { siteId, status, containerName, error } = await req.json()
    if (typeof siteId !== 'string' || (status !== 'active' && status !== 'provision_failed')) {
      return NextResponse.json({ error: 'siteId and a valid status are required' }, { status: 400 })
    }
    const sql = await db()
    await applyWpSharedProvisionResult(sql, siteId, { status, containerName, error })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
