'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Incident = {
  id: string
  source: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  description: string
  status: string
  action_taken: string | null
  last_seen_at?: string
  resolved_at?: string
  created_at: string
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-400 text-red-600 dark:border-red-500/40 dark:text-red-400',
  warning: 'border-amber-400 text-amber-600 dark:border-amber-500/40 dark:text-amber-400',
  info: 'border-slate-300 text-slate-500 dark:border-zinc-700 dark:text-zinc-400',
}

export default function AdminNeo() {
  const [open, setOpen] = useState<Incident[] | null>(null)
  const [resolved, setResolved] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/neo/incidents')
      .then((res) => res.json())
      .then((data) => {
        setOpen(data.open ?? [])
        setResolved(data.recentResolved ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href="/admin" className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">
              ← Admin
            </a>
            <h1 className="text-2xl font-bold mt-1">NEO 🛰️</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-lg">
              Runs a real health check every 15 minutes — key endpoints, WP shared-hosting nodes, Stripe reachability.
              Auto-fixes only a pre-approved, explicitly-registered safe-action list (currently empty — nothing has
              been added yet); everything else lands here for a human to review, on purpose.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <h2 className="text-sm font-semibold mt-10 mb-3">Needs review ({open?.length ?? (loading ? '…' : 0)})</h2>
        {loading && <p className="text-xs text-slate-400 dark:text-zinc-500">Loading…</p>}
        {!loading && open?.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-zinc-500">Nothing open — all clear as of the last check.</p>
        )}
        <div className="space-y-2">
          {open?.map((inc) => (
            <div
              key={inc.id}
              className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.info}`}
                >
                  {inc.severity}
                </span>
                <span className="text-xs text-slate-400 dark:text-zinc-500">{inc.category}</span>
              </div>
              <p className="text-sm mt-2">{inc.description}</p>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                Last seen {new Date(inc.last_seen_at ?? inc.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold mt-10 mb-3">Recently resolved</h2>
        {!loading && resolved.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-zinc-500">Nothing resolved yet.</p>
        )}
        <div className="space-y-2">
          {resolved.map((inc) => (
            <div key={inc.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${inc.status === 'auto_fixed' ? 'border-emerald-400 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400' : SEVERITY_STYLE.info}`}
                >
                  {inc.status === 'auto_fixed' ? 'auto-fixed' : 'resolved'}
                </span>
                <span className="text-xs text-slate-400 dark:text-zinc-500">{inc.category}</span>
              </div>
              <p className="text-sm mt-2 text-slate-600 dark:text-zinc-300">{inc.description}</p>
              {inc.action_taken && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Action: {inc.action_taken}</p>
              )}
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                {new Date(inc.resolved_at ?? inc.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
