'use client'

import { useEffect, useState } from 'react'

type Member = { id: string; email: string | null; role: string; status: string }
type OrgData = { org: { name: string; seatLimit: number | null } | null; myRole: string; members: Member[] } | null

export default function BarioOneTeam() {
  const [data, setData] = useState<OrgData>(undefined as any)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'employee'>('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/organization')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
      setNotice(`Invite sent to ${email}`)
      setEmail('')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data?.org) return <p className="text-sm text-slate-500 dark:text-zinc-400">Set up Bario One from the dashboard first.</p>

  const canInvite = data.myRole === 'owner' || data.myRole === 'admin'

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5">
        <p className="text-xs font-medium mb-3 text-slate-500 dark:text-zinc-400">
          Team members {data.org.seatLimit !== null && `(${data.members.length}/${data.org.seatLimit} seats)`}
        </p>
        <ul className="divide-y divide-slate-200 dark:divide-zinc-800">
          {data.members.map((m) => (
            <li key={m.id} className="py-2 flex items-center justify-between text-sm">
              <span>{m.email}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 capitalize">{m.role}</span>
                {m.status === 'invited' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                    Invited
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canInvite && (
        <form onSubmit={handleInvite} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 space-y-3">
          <p className="text-sm font-semibold">Invite a teammate</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}
              className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
            >
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          {notice && <p className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</p>}
        </form>
      )}
    </div>
  )
}
