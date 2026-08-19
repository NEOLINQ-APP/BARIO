'use client'

import { useState } from 'react'

export default function VictoriaDemoRequestForm({
  product = 'personal',
  assistantName = 'Victoria',
}: {
  product?: 'personal' | 'business'
  assistantName?: string
}) {
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/public/victoria-demo-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          phoneNumber,
          note: note || undefined,
          product,
          companyName: product === 'business' ? companyName || undefined : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — try again.')
        setLoading(false)
        return
      }
      setDone(true)
    } catch {
      setError('Something went wrong — try again.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <p className="font-semibold text-slate-900 dark:text-white">You're on the list!</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          We'll reach out shortly to set up your live demo with {assistantName}.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
      <div>
        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Your name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        />
      </div>
      {product === 'business' && (
        <div>
          <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Business name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
          />
        </div>
      )}
      <div>
        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Phone number</label>
        <input
          type="tel"
          required
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="(780) 555-1234"
          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Anything specific you'd like to try? (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2.5 rounded-xl font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Sending…' : 'Request a live demo'}
      </button>
      <p className="text-xs text-center text-slate-400 dark:text-slate-500">
        We'll call or text you to set up a real conversation with {assistantName}.
      </p>
    </form>
  )
}
