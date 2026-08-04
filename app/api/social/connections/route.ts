import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { ALL_SOCIAL_PLATFORMS, isSocialAppConfigured, isSocialPlatform } from '@/lib/social/platforms'
import { isSocialConnected, deleteSocialConnection, setNotifyPhone, listSocialConnections } from '@/lib/social/connections'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const connected = Object.fromEntries(await Promise.all(ALL_SOCIAL_PLATFORMS.map(async (p) => [p, await isSocialConnected(sql, session.userId, p)])))
  const appConfigured = Object.fromEntries(ALL_SOCIAL_PLATFORMS.map((p) => [p, isSocialAppConfigured(p)]))
  const rows = await listSocialConnections(sql, session.userId)
  const notifyPhone = rows.find((r) => r.notify_phone)?.notify_phone ?? null

  return NextResponse.json({ connected, appConfigured, notifyPhone })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const { notifyPhone } = await req.json()
    if (typeof notifyPhone !== 'string' || !/^\+\d{10,15}$/.test(notifyPhone)) {
      return NextResponse.json({ error: 'Enter a valid phone number in +1XXXXXXXXXX format' }, { status: 400 })
    }
    const sql = await db()
    await setNotifyPhone(sql, session.userId, notifyPhone)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const platform = new URL(req.url).searchParams.get('platform')
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })

  const sql = await db()
  await deleteSocialConnection(sql, session.userId, platform)
  return NextResponse.json({ ok: true })
}
