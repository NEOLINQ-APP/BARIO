import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { computeClaudeCostCents, computeTwilioCostCents } from '@/lib/victoriaCallCost'
import { errorResponse } from '@/lib/errors'
import { BARIO_ONE_CALL_LOG_ORG_IDS, findOrCreateBoCustomerByPhone, logBoCallNote, setBoCustomerEmailIfMissing } from '@/lib/barioOneCrmCallLog'

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
    const businessKey = ['unique', 'afc', 'sunbuilt', 'bario'].includes(body?.businessKey) ? body.businessKey : 'unique'
    const direction = String(body?.direction ?? 'inbound')
    const fromNumber = String(body?.fromNumber ?? '')
    const toNumber = String(body?.toNumber ?? '')
    const durationSeconds = Math.max(Math.round(Number(body?.durationSeconds) || 0), 0)
    const claudeInputTokens = Math.max(Math.round(Number(body?.claudeInputTokens) || 0), 0)
    const claudeOutputTokens = Math.max(Math.round(Number(body?.claudeOutputTokens) || 0), 0)
    const startedAt = body?.startedAt ? new Date(body.startedAt) : new Date()
    const endedAt = body?.endedAt ? new Date(body.endedAt) : new Date()
    const callerName = typeof body?.callerName === 'string' && body.callerName.trim() ? body.callerName.trim().slice(0, 100) : null
    const summary = typeof body?.summary === 'string' && body.summary.trim() ? body.summary.trim().slice(0, 1000) : null
    // New 2026-08-15 — whatever else Victoria picked up during the call
    // (email, mailing address, personality/attitude read) beyond the
    // one-line summary. Both best-effort, never block the call-log write.
    const callerEmail = typeof body?.callerEmail === 'string' && body.callerEmail.trim() ? body.callerEmail.trim().slice(0, 200) : null
    const personalNotes = typeof body?.personalNotes === 'string' && body.personalNotes.trim() ? body.personalNotes.trim().slice(0, 1000) : null

    if (!callSid) return NextResponse.json({ error: 'callSid is required' }, { status: 400 })

    const claudeCostCents = computeClaudeCostCents(claudeInputTokens, claudeOutputTokens)
    const twilioCostCents = computeTwilioCostCents(durationSeconds)
    const totalCostCents = claudeCostCents + twilioCostCents

    await sql`
      INSERT INTO victoria_calls (
        id, call_sid, business_key, direction, from_number, to_number, duration_seconds,
        claude_input_tokens, claude_output_tokens, claude_cost_cents, twilio_cost_cents, total_cost_cents,
        started_at, ended_at, caller_name, summary
      ) VALUES (
        ${randomUUID()}, ${callSid}, ${businessKey}, ${direction}, ${fromNumber}, ${toNumber}, ${durationSeconds},
        ${claudeInputTokens}, ${claudeOutputTokens}, ${claudeCostCents}, ${twilioCostCents}, ${totalCostCents},
        ${startedAt.toISOString()}, ${endedAt.toISOString()}, ${callerName}, ${summary}
      )
      ON CONFLICT (call_sid) DO NOTHING
    `

    // Best-effort: sync the call into the business's CRM as a contact +
    // note. All 4 lines now repointed to their real Bario One CRM (AFC/
    // Sunbuilt 2026-08-18, unique/bario 2026-08-20 once their Twenty
    // stacks were confirmed migrated/empty — see
    // lib/barioOneCrmCallLog.ts) — nothing left routing through the old
    // per-business Twenty stacks in lib/crmOutreach.ts for this path.
    // Never let a CRM hiccup fail the call-log write above — that's the
    // authoritative record.
    if (businessKey in BARIO_ONE_CALL_LOG_ORG_IDS) {
      const otherPartyNumber = direction === 'inbound' ? fromNumber : toNumber
      if (otherPartyNumber) {
        try {
          const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
          const customerId = await findOrCreateBoCustomerByPhone(sql, orgId, otherPartyNumber, callerName)
          if (customerId) {
            await logBoCallNote(sql, orgId, customerId, direction, summary, durationSeconds, personalNotes)
            if (callerEmail) await setBoCustomerEmailIfMissing(sql, customerId, callerEmail)
          }
        } catch (err) {
          console.error(`Bario One CRM call sync failed for ${businessKey}/${callSid}:`, err)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
