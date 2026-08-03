import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { computeClaudeCostCents, computeTwilioCostCents } from '@/lib/victoriaCallCost'
import { errorResponse } from '@/lib/errors'

// Called by the VPS-side miko-voice server.js at the end of every call
// (ws.on('close')) — not a customer-facing route, Bearer-gated the same
// way every other server-to-server admin route is.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const callSid = String(body?.callSid ?? '')
    const businessKey = ['unique', 'afc', 'sunbuilt'].includes(body?.businessKey) ? body.businessKey : 'unique'
    const direction = String(body?.direction ?? 'inbound')
    const fromNumber = String(body?.fromNumber ?? '')
    const toNumber = String(body?.toNumber ?? '')
    const durationSeconds = Math.max(Math.round(Number(body?.durationSeconds) || 0), 0)
    const claudeInputTokens = Math.max(Math.round(Number(body?.claudeInputTokens) || 0), 0)
    const claudeOutputTokens = Math.max(Math.round(Number(body?.claudeOutputTokens) || 0), 0)
    const startedAt = body?.startedAt ? new Date(body.startedAt) : new Date()
    const endedAt = body?.endedAt ? new Date(body.endedAt) : new Date()

    if (!callSid) return NextResponse.json({ error: 'callSid is required' }, { status: 400 })

    const claudeCostCents = computeClaudeCostCents(claudeInputTokens, claudeOutputTokens)
    const twilioCostCents = computeTwilioCostCents(durationSeconds)
    const totalCostCents = claudeCostCents + twilioCostCents

    await sql`
      INSERT INTO victoria_calls (
        id, call_sid, business_key, direction, from_number, to_number, duration_seconds,
        claude_input_tokens, claude_output_tokens, claude_cost_cents, twilio_cost_cents, total_cost_cents,
        started_at, ended_at
      ) VALUES (
        ${randomUUID()}, ${callSid}, ${businessKey}, ${direction}, ${fromNumber}, ${toNumber}, ${durationSeconds},
        ${claudeInputTokens}, ${claudeOutputTokens}, ${claudeCostCents}, ${twilioCostCents}, ${totalCostCents},
        ${startedAt.toISOString()}, ${endedAt.toISOString()}
      )
      ON CONFLICT (call_sid) DO NOTHING
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
