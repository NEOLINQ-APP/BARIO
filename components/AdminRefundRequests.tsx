'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type RefundRequest = {
  id: string
  user_id: string | null
  user_name: string | null
  account_email: string
  service_name: string
  reason: string
  attachment_url: string | null
  status: 'pending_review' | 'approved' | 'denied'
  sms_alert_sent: boolean
  created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  pending_review: 'border-amber-400 text-amber-600 dark:border-amber-500/40 dark:text-amber-400',
  approved: 'border-emerald-400 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400',
  denied: 'border-red-400 text-red-600 dark:border-red-500/40 dark:text-red-400',
}

export default function AdminRefundRequests() {
  const [requests, setRequests] = useState<RefundRequest[] | null>(null)

  function load() {
    fetch('/api/admin/refund-requests')
      .then((r) => r.json())
      .then((data) => setRequests(data.requests ?? []))
  }

  useEffect(load, [])

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/refund-requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href="/admin" className="text-xs text-slate-500 dark:text-zinc-400 hover:underline">
              ← Admin
            </a>
            <h1 className="text-2xl font-bold mt-1">Refund Requests</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-lg">
              Filed by Aria (pre/post-login assistant) whenever a customer asks for a refund or credit — she never
              approves or processes anything herself, this is just the record for manual review.
            </p>
          </div>
          <ThemeToggle />
        </div>

        {!requests && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-8">Loading…</p>}
        {requests?.length === 0 && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-8">No requests yet.</p>}

        <div className="space-y-3 mt-8">
          {requests?.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
              <div className="flex items-center gap-2 flex-wrap justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-medium">{r.user_name || r.account_email}</span>
                  <span className="text-xs text-slate-400 dark:text-zinc-500">{r.account_email}</span>
                  {!r.sms_alert_sent && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400">
                      no SMS sent
                    </span>
                  )}
                </div>
                <select
                  value={r.status}
                  onChange={(e) => setStatus(r.id, e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="pending_review">Pending review</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
              <p className="text-sm mt-2 font-medium">{r.service_name}</p>
              <p className="text-sm text-slate-600 dark:text-zinc-300 mt-1">{r.reason}</p>
              {r.attachment_url && (
                <a href={r.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline mt-1 inline-block">
                  View attachment →
                </a>
              )}
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-2">{new Date(r.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
