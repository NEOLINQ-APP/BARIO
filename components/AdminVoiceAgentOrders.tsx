'use client'

import { useEffect, useState } from 'react'

type Order = {
  id: string
  business_name: string
  business_description: string
  forward_to_number: string
  greeting: string | null
  user_email: string
  status: 'pending_build' | 'active'
  config: { twilio_number: string; greeting: string } | null
}

export default function AdminVoiceAgentOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [numberInputs, setNumberInputs] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/admin/voice-agent')
    const data = await res.json()
    if (res.ok) setOrders(data.orders)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleBuild(orderId: string) {
    const twilioNumber = (numberInputs[orderId] ?? '').trim()
    if (!twilioNumber) {
      setError('Enter the Twilio number assigned to this order first')
      return
    }
    setBusyId(orderId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/voice-agent/${orderId}/build`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ twilioNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Build failed')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setBusyId(null)
  }

  if (orders === null) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  const pending = orders.filter((o) => o.status === 'pending_build')
  const active = orders.filter((o) => o.status === 'active')

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <h2 className="text-sm font-bold mb-3">Awaiting build ({pending.length})</h2>
        {!pending.length && <p className="text-sm text-slate-400 dark:text-zinc-500">Nothing waiting.</p>}
        <div className="space-y-3">
          {pending.map((o) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
              <div>
                <p className="font-semibold text-sm">{o.business_name} <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal">— {o.user_email}</span></p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{o.business_description}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Forwards to: <code>{o.forward_to_number}</code></p>
                {o.greeting && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Requested greeting: "{o.greeting}"</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={numberInputs[o.id] ?? ''}
                  onChange={(e) => setNumberInputs((prev) => ({ ...prev, [o.id]: e.target.value }))}
                  placeholder="+17801234567 (assigned Twilio number)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                />
                <button
                  onClick={() => handleBuild(o.id)}
                  disabled={busyId === o.id}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs whitespace-nowrap"
                >
                  {busyId === o.id ? 'Building…' : 'Build'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold mb-3">Active ({active.length})</h2>
        <div className="space-y-1">
          {active.map((o) => (
            <div key={o.id} className="text-xs border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between">
              <span>{o.business_name} — {o.user_email}</span>
              <code className="text-cyan-600 dark:text-cyan-400">{o.config?.twilio_number}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
