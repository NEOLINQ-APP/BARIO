import { NextResponse } from 'next/server'
import { put } from '@/lib/storage'
import { requireBoModule } from '@/lib/barioOne'
import type { BoEmployee } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can upload employee documents' }, { status: 403 })
    }

    const rows = (await sql`SELECT * FROM bo_employees WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoEmployee[]
    const employee = rows[0]
    if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })

    const blob = await put(`bario-one/${org.id}/employees/${employee.id}/${Date.now()}-${file.name}`, file, {
      access: 'public',
      contentType: file.type || 'application/octet-stream',
    })

    const documents = JSON.parse(employee.document_urls_json) as { name: string; url: string }[]
    documents.push({ name: file.name, url: blob.url })

    await sql`UPDATE bo_employees SET document_urls_json = ${JSON.stringify(documents)}, updated_at = now() WHERE id = ${employee.id}`
    return NextResponse.json({ ok: true, documents })
  } catch (err: any) {
    return errorResponse(err)
  }
}
