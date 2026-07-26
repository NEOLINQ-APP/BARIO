import { getSession } from '@/lib/session'
import FamilyAccept from '@/components/FamilyAccept'

export const dynamic = 'force-dynamic'

export default async function FamilyAcceptPage({ searchParams }: { searchParams: { token?: string } }) {
  const session = await getSession()
  const token = searchParams.token ?? ''

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16 flex items-center justify-center">
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-[#131b2a] p-8 text-center">
        <h1 className="text-xl font-bold mb-2">Family Plan Invite</h1>
        {!token ? (
          <p className="text-sm text-zinc-400">This invite link is missing its token.</p>
        ) : !session ? (
          <>
            <p className="text-sm text-zinc-400 mb-6">Log in or create a Bario account with the email this invite was sent to, then come back to this link.</p>
            <div className="flex items-center justify-center gap-3">
              <a href="/login" className="px-4 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold">Log In</a>
              <a href="/signup" className="px-4 py-2 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200">Sign Up</a>
            </div>
          </>
        ) : (
          <FamilyAccept token={token} />
        )}
      </div>
    </main>
  )
}
