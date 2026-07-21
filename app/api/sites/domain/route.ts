import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { addDomainToVercel, removeDomainFromVercel, wwwSibling } from '@/lib/vercel'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { domain } = await req.json()
    const clean = String(domain ?? '').trim().toLowerCase()
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
      return NextResponse.json({ error: 'Enter a valid domain, e.g. myrestaurant.com' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT id FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as { id: string }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Save your site before connecting a domain' }, { status: 400 })

    const vercelResult = await addDomainToVercel(clean)

    const www = wwwSibling(clean)
    if (www) {
      try {
        await addDomainToVercel(www)
      } catch {
        // Non-fatal: the apex domain is what we track verification against.
      }
    }

    await sql`UPDATE sites SET custom_domain = ${clean}, domain_status = 'pending' WHERE id = ${site.id}`

    return NextResponse.json({
      ok: true,
      verified: vercelResult.verified ?? false,
      instructions: {
        a: { type: 'A', name: '@', value: '76.76.21.21' },
        cname: { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT id, custom_domain FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
      id: string
      custom_domain: string | null
    }[]
    const site = rows[0]
    if (!site?.custom_domain) return NextResponse.json({ error: 'No custom domain connected' }, { status: 400 })

    await removeDomainFromVercel(site.custom_domain)
    const www = wwwSibling(site.custom_domain)
    if (www) {
      try {
        await removeDomainFromVercel(www)
      } catch {
        // Non-fatal cleanup — apex removal above is what matters.
      }
    }

    await sql`UPDATE sites SET custom_domain = NULL, domain_status = 'none' WHERE id = ${site.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
