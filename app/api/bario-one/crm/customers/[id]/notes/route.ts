import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isRecordVisibleToMember, listOrgMembers, requireBoModule } from '@/lib/barioOne'
import { parseMentions } from '@/lib/barioOneMentions'
import { sendEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth

    const customerRows = (await sql`SELECT id, contact_name, assigned_to_user_id FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; contact_name: string; assigned_to_user_id: string | null }[]
    if (customerRows.length === 0 || !isRecordVisibleToMember(membership, customerRows[0].assigned_to_user_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { body, kind: rawKind } = await req.json()
    if (typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
    }
    const kind = rawKind === 'comment' ? 'comment' : 'note'

    let mentionedUserIds: string[] = []
    if (kind === 'comment') {
      const members = await listOrgMembers(sql, org.id)
      mentionedUserIds = parseMentions(
        body,
        members.map((m) => ({ userId: m.user_id, email: m.email }))
      ).filter((id) => id !== user.id) // never notify yourself
    }

    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body, mentioned_user_ids_json)
      VALUES (${randomUUID()}, ${org.id}, ${params.id}, ${user.id}, ${kind}, ${body.trim()}, ${JSON.stringify(mentionedUserIds)})
    `

    if (mentionedUserIds.length > 0) {
      const memberRows = (await sql`SELECT id, email FROM users WHERE id = ANY(${mentionedUserIds})`) as unknown as { id: string; email: string }[]
      const customerName = customerRows[0].contact_name
      const link = `https://www.bario.ca/dashboard/bario-one/crm/${params.id}`
      // Best-effort -- a mention notification failing shouldn't fail the
      // comment itself (the comment is already saved above).
      await Promise.all(
        memberRows.map((m) =>
          sendEmail(
            m.email,
            `${user.email} mentioned you on ${customerName}`,
            `<p><strong>${user.email}</strong> mentioned you in a comment on <strong>${customerName}</strong>:</p><p>${body.trim()}</p><p><a href="${link}">View in Bario One CRM</a></p>`
          ).catch(() => {})
        )
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
