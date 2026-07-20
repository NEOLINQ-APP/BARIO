'use client'

import { useState } from 'react'

export default function RedeemGiftCode() {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/gift-codes/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Redeem failed')
      setMessage({ text: `+${data.creditsAdded} credits added! You now have ${data.creditsRemaining}.`, ok: true })
      setCode('')
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter a gift or promo code"
          className="flex-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm uppercase"
        />
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg border border-zinc-700 text-xs font-semibold disabled:opacity-50 flex-shrink-0">
          {loading ? 'Redeeming…' : 'Redeem'}
        </button>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
      )}
    </form>
  )
}
