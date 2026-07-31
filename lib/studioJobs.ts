import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { getJobStatus } from '@/lib/runpod'

export type StudioJobRow = {
  id: string
  user_id: string
  job_type: string
  provider_request_id: string | null
  input_params: unknown
  status: string
  output_url: string | null
  credits_charged: number
  error: string | null
  created_at: string
  completed_at: string | null
}

// Shared by the client-facing status-poll route and the reconcile cron —
// both need the same "check RunPod, persist the result, refund on failure"
// logic, just triggered from different places (a user checking in vs. a
// sweep for jobs nobody polled).
export async function resolveStudioJob(sql: any, job: StudioJobRow): Promise<StudioJobRow> {
  if (job.status !== 'pending' && job.status !== 'processing') return job
  if (!job.provider_request_id) return job

  const result = await getJobStatus(job.provider_request_id)

  if (result.status === 'processing' || result.status === 'pending') {
    if (result.status !== job.status) {
      await sql`UPDATE studio_jobs SET status = ${result.status} WHERE id = ${job.id}`
    }
    return { ...job, status: result.status }
  }

  if (result.status === 'failed') {
    await sql`UPDATE studio_jobs SET status = 'failed', error = ${result.error}, completed_at = now() WHERE id = ${job.id}`
    if (job.credits_charged > 0) {
      await sql`UPDATE users SET credits_remaining = credits_remaining + ${job.credits_charged} WHERE id = ${job.user_id}`
    }
    return { ...job, status: 'failed', error: result.error }
  }

  // Complete — re-host the worker's base64 output on Vercel Blob (same
  // storage BARIO already uses for X-Drive/media uploads) rather than
  // trying to link the worker directly, since it has no durable URL of its
  // own to hand back.
  const contentType = result.outputContentType || (job.job_type === 'voiceover' ? 'audio/wav' : 'video/mp4')
  const ext = contentType.startsWith('audio') ? 'wav' : 'mp4'
  const bytes = Buffer.from(result.outputBase64 || '', 'base64')
  const blob = await put(`studio/${job.user_id}/${job.id}.${ext}`, bytes, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  })

  await sql`UPDATE studio_jobs SET status = 'complete', output_url = ${blob.url}, completed_at = now() WHERE id = ${job.id}`

  // Also surface it in the user's X-Drive so generated clips aren't only
  // reachable from the Studio page.
  await sql`
    INSERT INTO media_assets (id, user_id, folder, filename, url, content_type, size_bytes)
    VALUES (${randomUUID()}, ${job.user_id}, 'studio', ${`${job.id}.${ext}`}, ${blob.url}, ${contentType}, ${bytes.length})
  `

  return { ...job, status: 'complete', output_url: blob.url }
}
