'use client'

import { useEffect, useState } from 'react'

type PendingLicense = {
  id: string
  license_key: string
  status: string
  created_at: string
  user_email: string
  template_title: string
}

export default function AdminTemplateApprovals() {
  const [pending, setPending] = useState<PendingLicense[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/templates/pending')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setPending(data.pending)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAction(licenseId: string, action: 'approve' | 'revoke') {
    setBusyId(licenseId)
    try {
      const res = await fetch('/api/admin/templates/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ licenseId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <a href="/admin/gift-codes" className="text-sm text-zinc-400 hover:text-zinc-200">Gift & promo credit codes →</a>
        <h1 className="text-2xl font-bold mt-2">Pending Template License Approvals</h1>
        <p className="text-sm text-zinc-400 mt-1">Only approved licenses can edit or export their template.</p>

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        {!pending && !error && <p className="text-zinc-500 text-sm mt-4">Loading…</p>}
        {pending?.length === 0 && <p className="text-zinc-500 text-sm mt-6">Nothing pending.</p>}

        <div className="mt-6 space-y-3">
          {pending?.map((p) => (
            <div key={p.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-sm">{p.template_title}</div>
                <div className="text-xs text-zinc-400 mt-1">{p.user_email}</div>
                <div className="text-[11px] text-zinc-600 mt-1 font-mono">{p.license_key}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAction(p.id, 'approve')}
                  disabled={busyId === p.id}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(p.id, 'revoke')}
                  disabled={busyId === p.id}
                  className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs font-semibold disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
