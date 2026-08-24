import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { ensureCreditsRefreshed, creditsForVideoJob } from '@/lib/credits'
import { recordLegalAcceptance } from '@/lib/legal'
import { CURRENT_STUDIO_POLICY_VERSION } from '@/lib/legalVersion'
import { submitJob } from '@/lib/runpod'
import { rateLimit } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

const MAX_DURATION_SECONDS = 10

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Studio' }, { status: 403 })
    }

    const { prompt, sourceImageUrl, durationSeconds, legalAccepted } = await req.json()

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'A prompt is required' }, { status: 400 })
    }
    const duration = Number(durationSeconds)
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
      return NextResponse.json({ error: `durationSeconds must be between 1 and ${MAX_DURATION_SECONDS}` }, { status: 400 })
    }

    // One-time gate, not per-request like the VPS order flow — Studio is
    // meant to be used repeatedly, so acceptance is recorded once per policy
    // version rather than re-collected on every generation.
    const existingAcceptance = (await sql`
      SELECT 1 FROM legal_acceptances
      WHERE user_id = ${user.id} AND policy_slug = 'studio_aup' AND policy_version = ${CURRENT_STUDIO_POLICY_VERSION}
    `) as unknown as unknown[]
    if (existingAcceptance.length === 0) {
      if (legalAccepted !== true) {
        return NextResponse.json({ error: 'You must accept the Studio Acceptable Use Policy to continue', requiresAup: true }, { status: 400 })
      }
      const forwardedFor = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      await recordLegalAcceptance(sql, {
        userId: user.id,
        policySlug: 'studio_aup',
        policyVersion: CURRENT_STUDIO_POLICY_VERSION,
        ip: forwardedFor,
        userAgent: req.headers.get('user-agent'),
      })
    }

    const allowed = await rateLimit(sql, `studio-generate:${user.id}`, 20, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many generations this hour — please try again later.' }, { status: 429 })
    }

    if (!user.is_admin) {
      const creditsRemaining = await ensureCreditsRefreshed(sql, user)
      const cost = creditsForVideoJob(duration)
      if (creditsRemaining < cost) {
        return NextResponse.json(
          { error: `This generation needs ${cost} credits but you have ${creditsRemaining}. Upgrade your plan or wait for your next refresh.` },
          { status: 403 }
        )
      }
    }

    const cost = user.is_admin ? 0 : creditsForVideoJob(duration)
    if (cost > 0) {
      await sql`UPDATE users SET credits_remaining = credits_remaining - ${cost} WHERE id = ${user.id}`
    }

    // The worker has no way to fetch a URL itself — it only accepts an
    // uploaded image as base64 (same shape ComfyUI's own /upload/image
    // expects) — so any source image is fetched and encoded here rather
    // than passed through as a URL.
    let sourceImageBase64: string | undefined
    if (typeof sourceImageUrl === 'string' && sourceImageUrl.trim().length > 0) {
      const imageRes = await fetch(sourceImageUrl.trim())
      if (!imageRes.ok) {
        return NextResponse.json({ error: "Couldn't fetch that source image URL" }, { status: 400 })
      }
      sourceImageBase64 = Buffer.from(await imageRes.arrayBuffer()).toString('base64')
    }

    const jobId = randomUUID()
    const inputParams = { prompt: prompt.trim(), sourceImageUrl: sourceImageUrl ?? null, durationSeconds: duration }
    await sql`
      INSERT INTO studio_jobs (id, user_id, job_type, input_params, status, credits_charged)
      VALUES (${jobId}, ${user.id}, 'video', ${JSON.stringify(inputParams)}, 'pending', ${cost})
    `

    try {
      const { requestId } = await submitJob({
        jobType: 'video',
        prompt: inputParams.prompt,
        sourceImageBase64,
        durationSeconds: duration,
      })
      await sql`UPDATE studio_jobs SET provider_request_id = ${requestId}, status = 'processing' WHERE id = ${jobId}`
    } catch (err: any) {
      // Submission itself failed (worker unreachable, bad input, etc.) —
      // refund immediately rather than leaving a charged, dead job for the
      // reconcile cron to eventually clean up.
      await sql`UPDATE studio_jobs SET status = 'failed', error = ${err.message} WHERE id = ${jobId}`
      if (cost > 0) {
        await sql`UPDATE users SET credits_remaining = credits_remaining + ${cost} WHERE id = ${user.id}`
      }
      throw err
    }

    return NextResponse.json({ ok: true, jobId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
