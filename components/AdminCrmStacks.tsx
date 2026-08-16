'use client'

import { useEffect, useState } from 'react'

type Stack = {
  id: string
  slug: string
  subdomain: string
  workspaceDisplayName: string
  loginEmail: string
  status: string
  userEmail: string
  hasPassword: boolean
}

export default function AdminCrmStacks() {
  const [stacks, setStacks] = useState<Stack[] | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/admin/crm-stacks')
    const data = await res.json()
    if (res.ok) setStacks(data.stacks)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleReveal(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/crm-stacks/${id}/reveal-password`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not reveal password')
      setRevealed((prev) => ({ ...prev, [id]: data.password }))
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  async function handleSetPassword(id: string) {
    const password = (passwordInputs[id] ?? '').trim()
    if (!password) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/crm-stacks/${id}/set-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save password')
      setPasswordInputs((prev) => ({ ...prev, [id]: '' }))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  if (stacks === null) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      {!stacks.length && <p className="text-sm text-slate-400 dark:text-zinc-500">No client CRMs registered yet.</p>}

      {stacks.map((s) => (
        <div key={s.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">{s.workspaceDisplayName}</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">{s.userEmail} · {s.status}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Login: <code>{s.loginEmail}</code>
              </p>
            </div>
            <a
              href={`https://${s.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
            >
              Open CRM ↗
            </a>
          </div>

          {s.hasPassword ? (
            <div className="flex items-center gap-2">
              {revealed[s.id] ? (
                <code className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-xs break-all">{revealed[s.id]}</code>
              ) : (
                <button
                  onClick={() => handleReveal(s.id)}
                  disabled={busyId === s.id}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-600 disabled:opacity-50 text-xs font-semibold"
                >
                  {busyId === s.id ? 'Revealing…' : 'Reveal password'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={passwordInputs[s.id] ?? ''}
                onChange={(e) => setPasswordInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                placeholder="No password on file — paste it here once"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
              />
              <button
                onClick={() => handleSetPassword(s.id)}
                disabled={busyId === s.id}
                className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap"
              >
                Save
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
