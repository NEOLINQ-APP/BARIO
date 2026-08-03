import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import BuildEditor from '@/components/BuildEditor'

export const dynamic = 'force-dynamic'

// Bario Build — full-screen editor, deliberately outside the (account)
// dashboard chrome group, same convention as /build (the section-based
// Sky site builder). ?project=<id> reopens an existing project;
// otherwise a new one is created on the fly.
export default async function BuildAppsPage({ searchParams }: { searchParams: { project?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login')
  if (!hasBuildAccess(user)) redirect('/dashboard')

  let projectId = searchParams.project
  let projectName = 'Untitled project'

  if (projectId) {
    const rows = (await sql`SELECT id, name FROM build_projects WHERE id = ${projectId} AND user_id = ${user.id}`) as unknown as { id: string; name: string }[]
    if (rows.length === 0) projectId = undefined
    else projectName = rows[0].name
  }

  if (!projectId) {
    projectId = randomUUID()
    projectName = 'Untitled project'
    await sql`INSERT INTO build_projects (id, user_id, name) VALUES (${projectId}, ${user.id}, ${projectName})`
    redirect(`/build/apps?project=${projectId}`)
  }

  return <BuildEditor projectId={projectId} projectName={projectName} />
}
