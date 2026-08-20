import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { findDuplicateLead, calculateLeadScore, calculatePriority, recordPriorityChange, getLeadTimeline } from '@/lib/leadPipeline'
import { getLeadScoreWeights } from '@/lib/leadScoreConfig'
import { errorResponse } from '@/lib/errors'

// Throwaway verification route for Phase 1 (lead scoring/priority/dedupe) —
// safe to remove once confirmed working. Exercises the real functions
// against Unique Group Inc.'s real migrated data, doesn't fabricate
// anything.
const ORG_ID = 'f7e3dc4b-fb3c-41eb-a24d-6339491c927c' // Unique Group Inc.
const MR_MENDOZA_ID = 'ef1070f3-c7be-4c5c-837e-30ec0fd8f405'
const MR_MENDOZA_PHONE = '+17802410880'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    // 1. Duplicate detection — same phone as an existing real customer.
    const dup = await findDuplicateLead(sql, ORG_ID, { phone: MR_MENDOZA_PHONE })
    // 2. Duplicate detection — genuinely novel contact info.
    const noDup = await findDuplicateLead(sql, ORG_ID, { phone: '+15550001234', email: 'nobody-real@example.invalid' })

    // 3. Score calculation with realistic signals + real configured weights.
    const weights = await getLeadScoreWeights(sql)
    const { score, breakdown } = calculateLeadScore(weights, {
      locationMatch: true,
      serviceMatch: true,
      strongNeed: true,
      quoteRequested: true,
      appointmentRequested: true,
      timing: 'today',
      hasValidPhone: true,
      hasNeed: true,
      hasSource: true,
    })
    const { priority, reason } = calculatePriority(score)

    // 4. Actually write it against the real Mr. Mendoza record, then read
    // it back via getLeadTimeline to prove the full round-trip.
    await recordPriorityChange(sql, ORG_ID, MR_MENDOZA_ID, score, breakdown, priority, reason)
    const timeline = await getLeadTimeline(sql, MR_MENDOZA_ID)
    const updated = (await sql`SELECT current_score, current_priority FROM bo_customers WHERE id = ${MR_MENDOZA_ID}`) as unknown as { current_score: number; current_priority: string }[]

    return NextResponse.json({
      ok: true,
      duplicateDetection: { foundExistingByPhone: dup, foundNothingForNovelContact: noDup },
      scoring: { score, breakdown, priority, reason },
      writtenBackToCustomer: updated[0],
      timelineTopEntry: timeline[0],
    })
  } catch (err) {
    return errorResponse(err)
  }
}
