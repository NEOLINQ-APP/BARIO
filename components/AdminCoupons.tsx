'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Code = {
  id: string
  code: string
  active: boolean
  timesRedeemed: number
  maxRedemptions: number | null
  percentOff: number | null
  amountOffCents: number | null
  currency: string | null
  duration: string
  durationInMonths: number | null
  url: string
}

export default function AdminCoupons() {
  const [codes, setCodes] = useState<Code[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent')
  const [percentOff, setPercentOff] = useState('10')
  const [amountOffDollars, setAmountOffDollars] = useState('10')
  const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('once')
  const [durationInMonths, setDurationInMonths] = useState('3')
  const [maxRedemptions, setMaxRedemptions] = useState('')

  function load() {
    fetch('/api/admin/coupons')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setCodes(data.codes)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          percentOff: discountType === 'percent' ? Number(percentOff) : undefined,
          amountOffCents: discountType === 'amount' ? Math.round(Number(amountOffDollars) * 100) : undefined,
          duration,
          durationInMonths: duration === 'repeating' ? Number(durationInMonths) : undefined,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create code')
      setCode('')
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(promotionCodeId: string) {
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promotionCodeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to deactivate')
      load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  function copyUrl(c: Code) {
    navigator.clipboard.writeText(c.url)
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Coupons & Promoter Links</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Real Stripe discount codes — share the generated link with an influencer/promoter and it auto-applies at
              checkout, no manual code entry needed.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Code (e.g. an influencer's name)</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="JOHNDOE20"
              required
              className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setDiscountType('percent')} className={`text-xs px-3 py-1.5 rounded-lg ${discountType === 'percent' ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}>
              % off
            </button>
            <button type="button" onClick={() => setDiscountType('amount')} className={`text-xs px-3 py-1.5 rounded-lg ${discountType === 'amount' ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}>
              $ off
            </button>
          </div>

          {discountType === 'percent' ? (
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Percent off</label>
              <input type="number" min="1" max="100" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Dollars off (CAD)</label>
              <input type="number" min="1" value={amountOffDollars} onChange={(e) => setAmountOffDollars(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Applies to</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value as any)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
              <option value="once">First payment only</option>
              <option value="repeating">First few months</option>
              <option value="forever">Every payment, forever</option>
            </select>
          </div>
          {duration === 'repeating' && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">How many months</label>
              <input type="number" min="1" value={durationInMonths} onChange={(e) => setDurationInMonths(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Max redemptions (optional)</label>
            <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="Unlimited" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          </div>

          <button type="submit" disabled={creating} className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium py-2">
            {creating ? 'Creating…' : 'Create code'}
          </button>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </form>

        <div className="space-y-3">
          {codes?.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {c.code} <span className="text-xs text-slate-500 dark:text-zinc-500 font-normal">({c.percentOff ? `${c.percentOff}% off` : `$${((c.amountOffCents ?? 0) / 100).toFixed(2)} off`}, {c.duration})</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {c.timesRedeemed} used{c.maxRedemptions ? ` / ${c.maxRedemptions} max` : ''} · {c.active ? 'Active' : 'Deactivated'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => copyUrl(c)} className="text-xs rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 px-3 py-1.5">
                  {copiedId === c.id ? 'Copied!' : 'Copy link'}
                </button>
                {c.active && (
                  <button onClick={() => handleDeactivate(c.id)} className="text-xs rounded-lg bg-red-600 dark:bg-red-900 hover:bg-red-700 dark:hover:bg-red-800 text-white px-3 py-1.5">
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
