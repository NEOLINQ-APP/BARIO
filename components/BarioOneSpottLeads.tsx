'use client'

import { useEffect, useState } from 'react'

type Lead = {
  id: string
  contact_name: string | null
  customer_contact_name: string | null
  customer_id: string | null
  phone: string | null
  email: string | null
  message: string | null
  created_at: string
}

export default function BarioOneSpottLeads() {
  const [leads, setLeads] = useState<Lead[] | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/spott/leads').then((r) => r.json()).then((d) => setLeads(d.leads ?? []))
  }, [])

  if (leads === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (leads.length === 0) return <p className="text-sm text-slate-500 dark:text-zinc-400">No Spott leads yet. New leads from your listing land here automatically.</p>

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
      {leads.map((l) => (
        <div key={l.id} className="p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{l.contact_name || 'Unknown'}</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(l.created_at).toLocaleString()}</p>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{[l.email, l.phone].filter(Boolean).join(' · ')}</p>
          {l.message && <p className="mt-1 text-sm">{l.message}</p>}
          {l.customer_id ? (
            <a href={`/dashboard/bario-one/crm/${l.customer_id}`} className="mt-1 inline-block text-xs text-amber-600 hover:underline">
              View CRM contact{l.customer_contact_name ? ` — ${l.customer_contact_name}` : ''}
            </a>
          ) : (
            <p className="mt-1 text-xs text-slate-400 dark:text-zinc-500">No linked contact (couldn't match a name)</p>
          )}
        </div>
      ))}
    </div>
  )
}
