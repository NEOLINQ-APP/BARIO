import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Not module-gated -- the site-audit tool it links to is free-tier
// available platform-wide, not a Bario One module.
export default async function BarioOneMarketingSeoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">SEO</h1>
        <a href="/site-audit" className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors">
          <p className="font-semibold">Run a site audit →</p>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">A real crawl of your site with an AI-scored, prioritized fix list.</p>
        </a>
      </div>
    </main>
  )
}
