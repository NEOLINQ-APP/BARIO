import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { resolveStudioJob, type StudioJobRow } from '@/lib/studioJobs'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { jobId } = params
    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const rows = (await sql`SELECT * FROM studio_jobs WHERE id = ${jobId} AND user_id = ${user.id}`) as unknown as StudioJobRow[]
    let job = rows[0]
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    job = await resolveStudioJob(sql, job)

    return NextResponse.json({
      ok: true,
      status: job.status,
      outputUrl: job.output_url,
      error: job.error,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
