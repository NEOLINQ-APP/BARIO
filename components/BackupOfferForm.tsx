'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

const DISCLAIMER =
  "Backup Protection ($9/mo): We'll keep automatic backups of your site and data, so you can recover it if something goes wrong. If you decline, Bario keeps no backup of your account — if your data is lost, deleted, or corrupted for any reason, Bario is not liable and cannot recover it for you."

function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}

export default function BackupOfferForm() {
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const plan = params.get('plan')
  const promoCode = params.get('promo')
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A plan checkout was pending when they arrived here (they clicked signup
  // from a specific pricing button) -- resume it after their decision. If
  // they accepted backup protection, that's its own separate subscription
  // checkout that already redirects to the dashboard on success; a pending
  // plan is picked up from there instead of chaining two Stripe checkouts
  // back to back.
  async function continueToPlanOrNext() {
    if (plan) {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, promoCode: promoCode ?? undefined }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
    }
    window.location.href = next
  }

  async function accept() {
    setLoading('accept')
    setError(null)
    const res = await fetch('/api/backup-addon/accept', { method: 'POST' })
    const data = await res.json()
    if (!res.ok || !data.url) {
      setError(data.error ?? 'Could not start checkout')
      setLoading(null)
      return
    }
    window.location.href = data.url
  }

  async function decline() {
    setLoading('decline')
    setError(null)
    const res = await fetch('/api/backup-addon/decline', { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong')
      setLoading(null)
      return
    }
    await continueToPlanOrNext()
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-xl dark:shadow-none p-8">
      <h1 className="text-2xl font-bold mb-2">Protect your site with backups</h1>
      <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">{DISCLAIMER}</p>

      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-4">{error}</p>}

      <button
        onClick={accept}
        disabled={loading !== null}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading === 'accept' ? 'Starting checkout…' : 'Add Backup Protection — $9/mo'}
      </button>
      <button
        onClick={decline}
        disabled={loading !== null}
        className="w-full mt-3 px-4 py-2 rounded-xl font-semibold border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 disabled:opacity-60"
      >
        {loading === 'decline' ? 'Saving…' : 'No thanks, continue without backups'}
      </button>
    </div>
  )
}
