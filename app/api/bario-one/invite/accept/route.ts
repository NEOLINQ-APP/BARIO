import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { acceptInvite } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Log in first, then open the invite link again' }, { status: 401 })

    const { token } = await req.json()
    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
    }

    const sql = await db()
    const result = await acceptInvite(sql, token.trim(), session.userId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
