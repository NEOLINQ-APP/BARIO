import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { createSession } from '@/lib/session'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const sql = await db()
    const normalizedEmail = email.trim().toLowerCase()

    const existing = (await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`) as unknown as unknown[]
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const id = randomUUID()

    await sql`
      INSERT INTO users (id, email, password_hash)
      VALUES (${id}, ${normalizedEmail}, ${passwordHash})
    `

    await createSession(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
