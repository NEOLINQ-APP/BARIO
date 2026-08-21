'use client'

import { useEffect, useState } from 'react'

type Run = {
  id: string
  context_json: string
  success: boolean
  error: string | null
  created_at: string
  automation_name: string
  trigger_event: string
  action_type: string
}

export default function BarioOneAutomationRuns() {
  const [runs, setRuns] = useState<Run[] | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/automations/runs')
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
  }, [])

  if (runs === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (runs.length === 0) return <p className="text-sm text-slate-500 dark:text-zinc-400">No automations have run yet.</p>

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
      {runs.map((r) => (
        <div key={r.id} className="p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{r.automation_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
              {r.success ? 'Success' : 'Failed'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {r.trigger_event} → {r.action_type} · {new Date(r.created_at).toLocaleString()}
          </p>
          {r.error && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{r.error}</p>}
        </div>
      ))}
    </div>
  )
}
