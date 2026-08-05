import { NextResponse } from 'next/server'
import { db, type VoiceAgentConfig, type CrmStack } from '@/lib/db'
import { queryTwenty, TwentyNotLinkedError } from '@/lib/flo/twentyClient'
import { errorResponse } from '@/lib/errors'

// Called by miko-voice/server.js's take_message/take_order tool execution
// when a DB-backed customer (voice_agent_configs) has a linked Flo API key.
// Resolves the CRM write server-side from configId rather than having the
// VPS present a customer's raw Flo API key — that key was never stored in
// recoverable form (see lib/flo/apiKeys.ts), only its hash, so there's
// nothing to hand the VPS to present as a Bearer token in the first place.
// Bearer-gated with the same VOICE_AGENT_INTERNAL_SECRET as the config
// lookup route.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.VOICE_AGENT_INTERNAL_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const configId = typeof body?.configId === 'string' ? body.configId : ''
    const firstName = typeof body?.firstName === 'string' ? body.firstName : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName : ''
    const phone = typeof body?.phone === 'string' ? body.phone : null
    const note = typeof body?.note === 'string' ? body.note : null
    if (!configId) return NextResponse.json({ error: 'configId is required' }, { status: 400 })
    if (!firstName && !lastName) return NextResponse.json({ error: 'firstName or lastName is required' }, { status: 400 })

    const sql = await db()
    const configRows = (await sql`SELECT * FROM voice_agent_configs WHERE id = ${configId}`) as unknown as VoiceAgentConfig[]
    const config = configRows[0]
    if (!config) return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    if (!config.flo_api_key_id) return NextResponse.json({ error: 'No CRM linked for this config' }, { status: 409 })

    const keyRows = (await sql`SELECT crm_stack_id FROM flo_api_keys WHERE id = ${config.flo_api_key_id} AND revoked_at IS NULL`) as unknown as { crm_stack_id: string }[]
    if (!keyRows[0]) return NextResponse.json({ error: 'Linked Flo API key was revoked' }, { status: 409 })

    const stackRows = (await sql`SELECT * FROM crm_stacks WHERE id = ${keyRows[0].crm_stack_id}`) as unknown as CrmStack[]
    const crmStack = stackRows[0]
    if (!crmStack) return NextResponse.json({ error: 'Linked CRM workspace not found' }, { status: 404 })

    const data = await queryTwenty(
      crmStack,
      `mutation($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
      { data: { name: { firstName, lastName }, ...(phone ? { phones: { primaryPhoneNumber: phone } } : {}) } }
    )
    const personId = data.createPerson.id

    if (note) {
      const noteData = await queryTwenty(
        crmStack,
        `mutation($data: NoteCreateInput!){ createNote(data: $data) { id } }`,
        { data: { title: 'Voice Agent lead', bodyV2: { markdown: note } } }
      )
      await queryTwenty(
        crmStack,
        `mutation($data: NoteTargetCreateInput!){ createNoteTarget(data: $data) { id } }`,
        { data: { noteId: noteData.createNote.id, targetPersonId: personId } }
      )
    }

    return NextResponse.json({ ok: true, personId })
  } catch (err: any) {
    if (err instanceof TwentyNotLinkedError) return NextResponse.json({ error: err.message }, { status: 409 })
    return errorResponse(err)
  }
}
