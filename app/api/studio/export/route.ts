import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { ensureCreditsRefreshed, creditsForExportJob } from '@/lib/credits'
import { rateLimit } from '@/lib/rateLimit'
import { put } from '@/lib/storage'
import { renderExport } from '@/lib/studioExport'
import { MAX_EXPORT_DURATION_SECONDS, totalExportDurationSeconds, type ExportRequest } from '@/lib/studioTypes'
import { errorResponse } from '@/lib/errors'

// Runs ffmpeg (via lib/studioExport.ts) directly inside this route rather
// than dispatching to the RunPod worker — that endpoint is GPU-tier,
// sized/billed for Wan 2.2, and its image has no ffmpeg installed. This is
// plain CPU work, cheap on Vercel's own Node.js runtime, so it stays
// synchronous like voiceover/route.ts rather than job-polled like
// generate/route.ts — there's no GPU queue to wait behind.
export const maxDuration = 280

function isValidExportRequest(body: any): body is ExportRequest {
  if (!body || typeof body !== 'object') return false
  if (body.aspectRatio !== '16:9' && body.aspectRatio !== '9:16' && body.aspectRatio !== '1:1') return false
  if (!Array.isArray(body.clips) || body.clips.length === 0) return false
  if (!Array.isArray(body.textOverlays) || !Array.isArray(body.audioTracks)) return false
  for (const clip of body.clips) {
    if (clip.type !== 'Video' && clip.type !== 'Image') return false
    if (typeof clip.src !== 'string' || !clip.src) return false
    if (![clip.startSeconds, clip.durationSeconds, clip.trimStartSeconds, clip.trimEndSeconds].every((n) => typeof n === 'number' && Number.isFinite(n))) return false
    if (clip.durationSeconds <= 0) return false
  }
  return true
}

export async function POST(req: Request) {
  let sql: Awaited<ReturnType<typeof db>> | null = null
  let user: User | null = null
  let cost = 0
  let jobId: string | null = null
  let workDir: string | null = null

  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    user = userRows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use Studio' }, { status: 403 })
    }

    const body = await req.json()
    if (!isValidExportRequest(body)) {
      return NextResponse.json({ error: 'Malformed export request' }, { status: 400 })
    }

    const totalDuration = totalExportDurationSeconds(body)
    if (totalDuration > MAX_EXPORT_DURATION_SECONDS) {
      return NextResponse.json({ error: `Exports are capped at ${MAX_EXPORT_DURATION_SECONDS} seconds for now — trim your timeline.` }, { status: 400 })
    }

    const allowed = await rateLimit(sql, `studio-export:${user.id}`, 10, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many exports this hour — please try again later.' }, { status: 429 })
    }

    cost = user.is_admin ? 0 : creditsForExportJob(totalDuration, body.clips.length)
    if (!user.is_admin) {
      const creditsRemaining = await ensureCreditsRefreshed(sql, user)
      if (creditsRemaining < cost) {
        return NextResponse.json({ error: `This export needs ${cost} credits but you have ${creditsRemaining}.` }, { status: 403 })
      }
    }
    if (cost > 0) {
      await sql`UPDATE users SET credits_remaining = credits_remaining - ${cost} WHERE id = ${user.id}`
    }

    jobId = randomUUID()
    await sql`
      INSERT INTO studio_jobs (id, user_id, job_type, input_params, status, credits_charged)
      VALUES (${jobId}, ${user.id}, 'export', ${JSON.stringify(body)}, 'processing', ${cost})
    `

    workDir = path.join(os.tmpdir(), `studio-export-${jobId}`)
    const { outputPath, durationSeconds } = await renderExport(body, { workDir })
    const bytes = await fs.readFile(outputPath)

    const blob = await put(`studio/${user.id}/${jobId}.mp4`, bytes, { access: 'public', addRandomSuffix: true, contentType: 'video/mp4' })

    await sql`UPDATE studio_jobs SET status = 'complete', output_url = ${blob.url}, completed_at = now() WHERE id = ${jobId}`
    await sql`
      INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes)
      VALUES (${randomUUID()}, ${user.id}, 'studio', ${`${jobId}.mp4`}, ${blob.url}, ${'video/mp4'}, ${bytes.length})
    `

    return NextResponse.json({ ok: true, url: blob.url, durationSeconds })
  } catch (err: any) {
    if (sql && jobId) {
      await sql`UPDATE studio_jobs SET status = 'failed', error = ${err.message}, completed_at = now() WHERE id = ${jobId}`
      if (cost > 0 && user) {
        await sql`UPDATE users SET credits_remaining = credits_remaining + ${cost} WHERE id = ${user.id}`
      }
    }
    return errorResponse(err)
  } finally {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
