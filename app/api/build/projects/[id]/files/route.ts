import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuildAccess } from '@/lib/access'
import { ensureSandboxSession } from '@/lib/buildSession'
import { execInSandbox, writeSandboxFile } from '@/lib/sandboxHost'
import { errorResponse } from '@/lib/errors'

// Direct file-tree access for the editor UI — separate from the AI agent
// loop's own read_file/write_file tools, but operating on the exact same
// live sandbox session (via lib/buildSession.ts's shared ensureSandboxSession),
// so a manual edit here and an AI edit in chat never diverge onto different
// containers.
async function authorize(req: Request, projectId: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasBuildAccess(user)) return { error: NextResponse.json({ error: 'Please verify your email' }, { status: 403 }) }
  const projectRows = (await sql`SELECT id FROM build_projects WHERE id = ${projectId} AND user_id = ${user.id}`) as unknown as { id: string }[]
  if (projectRows.length === 0) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  return { sql, user }
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, "'\\''")}'`
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authorize(req, params.id)
    if ('error' in auth) return auth.error
    const { sql, user } = auth

    const { sandboxSessionId } = await ensureSandboxSession(sql, params.id, user.id)
    const url = new URL(req.url)
    const path = url.searchParams.get('path')

    if (path) {
      const result = await execInSandbox(sandboxSessionId, `cat ${shellQuote(path)}`)
      if ('exitCode' in result && result.exitCode !== 0) return NextResponse.json({ error: 'File not found' }, { status: 404 })
      return NextResponse.json({ content: 'output' in result ? result.output : '' })
    }

    const listing = await execInSandbox(
      sandboxSessionId,
      `find . -type f -not -path './node_modules/*' -not -path './.git/*' | sed 's#^\\./##' | sort`
    )
    const files = 'output' in listing ? listing.output.split('\n').map((f) => f.trim()).filter(Boolean) : []
    return NextResponse.json({ files })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authorize(req, params.id)
    if ('error' in auth) return auth.error
    const { sql, user } = auth

    const body = await req.json().catch(() => null)
    if (!body?.path || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'path and content are required' }, { status: 400 })
    }

    const { sandboxSessionId } = await ensureSandboxSession(sql, params.id, user.id)
    await writeSandboxFile(sandboxSessionId, body.path, body.content)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authorize(req, params.id)
    if ('error' in auth) return auth.error
    const { sql, user } = auth

    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

    const { sandboxSessionId } = await ensureSandboxSession(sql, params.id, user.id)
    await execInSandbox(sandboxSessionId, `rm -f ${shellQuote(path)}`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
