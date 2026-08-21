import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Business OS Phase 1 — hub page. These pages already existed but were
// only reachable via scattered links inside the old Dashboard tile grid;
// this gives them one real home under the new nav.
export default async function BarioOneSettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const links = [
    { href: '/dashboard/bario-one/company', title: 'Company settings →', desc: 'Business name, branding, and details.' },
    { href: '/dashboard/bario-one/team', title: 'Team →', desc: 'Invite teammates and manage roles.' },
    { href: '/dashboard/bario-one/modules', title: 'Modules & billing →', desc: 'Turn modules on or off and manage your subscription.' },
    { href: '/dashboard/bario-one/api', title: 'API & webhooks →', desc: 'API keys, outbound webhooks, and CSV export.' },
    { href: '/dashboard/bario-one/invite', title: 'Invite a teammate →', desc: 'Send a direct invite link.' },
  ]

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <div className="space-y-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors">
              <p className="font-semibold">{l.title}</p>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{l.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
