'use client'

import { useEffect, useState } from 'react'

type Key = { id: string; name: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null; revoked: boolean }

export default function FloApiKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/flo/keys')
    const data = await res.json()
    if (res.ok) setKeys(data.keys)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/flo/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name || 'API key' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create key')
      setNewRawKey(data.rawKey)
      setName('')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setCreating(false)
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/flo/keys?id=${id}`, { method: 'DELETE' })
    load()
  }

  if (keys === null) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

      {newRawKey && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm space-y-2">
          <p className="font-semibold text-amber-700 dark:text-amber-400">Copy this key now — it won&apos;t be shown again.</p>
          <code className="block bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs break-all select-all">{newRawKey}</code>
          <button onClick={() => setNewRawKey(null)} className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">
            Done, dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. Zapier integration)"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
        <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm">
          {creating ? 'Creating…' : 'New key'}
        </button>
      </form>

      <div className="space-y-1">
        {keys.length === 0 && <p className="text-sm text-slate-400 dark:text-zinc-500">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="text-sm border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <span className="font-medium">{k.name}</span>{' '}
              <code className="text-xs text-slate-400 dark:text-zinc-500">{k.keyPrefix}…</code>
              {k.revoked && <span className="ml-2 text-xs text-red-500">revoked</span>}
            </div>
            {!k.revoked && (
              <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 text-xs space-y-2">
        <p className="font-semibold text-slate-600 dark:text-zinc-300">Quick start</p>
        <pre className="bg-slate-50 dark:bg-zinc-950 rounded-lg p-3 overflow-x-auto text-slate-700 dark:text-zinc-300">
{`curl https://www.bario.ca/api/flo/v1/me \\
  -H "Authorization: Bearer flo_live_..."`}
        </pre>
        <p className="text-slate-500 dark:text-zinc-500">
          <code>/api/flo/v1/leads</code> and <code>/api/flo/v1/contacts</code> are also available. 60 requests/minute per key.
        </p>
      </div>
    </div>
  )
}
