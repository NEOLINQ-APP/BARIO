'use client'

import { useEffect, useState } from 'react'

type Workspace = { id: string; displayName: string; email: string; subdomain: string; status: string; step: string | null; lastError: string | null }

const STEP_LABEL: Record<string, string> = {
  starting_containers: 'Starting your CRM…',
  nginx_http: 'Setting up your subdomain…',
  cert: 'Securing your workspace (HTTPS)…',
  nginx_https: 'Finishing setup…',
  waiting_for_twenty: 'Almost there…',
  creating_admin: 'Creating your login…',
  activating_workspace: 'Activating your workspace…',
}

export default function CrmWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/crm/provision')
      const data = await res.json()
      if (res.ok) setWorkspace(data.workspace)
    } catch {
      // Non-fatal — the create form below still works even if this fails.
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (workspace?.status !== 'provisioning') return
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.status])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/provision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create your workspace')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setCreating(false)
  }

  if (workspace === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  if (!workspace) {
    return (
      <form onSubmit={handleCreate} className="space-y-3 max-w-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Workspace name</label>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Business Name"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Your email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Password</label>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
        >
          {creating ? 'Creating…' : 'Create my CRM'}
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {workspace.status === 'provisioning' && (
        <p className="text-sm">
          🟡 {(workspace.step && STEP_LABEL[workspace.step]) ?? 'Setting up your workspace…'} This can take a couple of minutes — your own dedicated CRM is being built, not a shared one.
        </p>
      )}
      {workspace.status === 'failed' && (
        <div>
          <p className="text-sm">🔴 Setup failed</p>
          {workspace.lastError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{workspace.lastError}</p>}
        </div>
      )}
      {workspace.status === 'active' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">{workspace.displayName} is ready.</p>
          <p className="text-slate-600 dark:text-zinc-400 mt-1">Log in with {workspace.email} at:</p>
          <a href={`https://${workspace.subdomain}`} target="_blank" rel="noreferrer" className="underline text-cyan-600 dark:text-cyan-400">
            {workspace.subdomain} →
          </a>
        </div>
      )}
    </div>
  )
}
