'use client'

import { useEffect, useState } from 'react'

type Review = { id: string; rating: number | null; body: string | null; owner_reply: string | null; owner_reply_at: string | null; created_at: string }

const input = 'w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm'
const btnPrimary = 'rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5'

function ReplyBox({ review, onReplied }: { review: Review; onReplied: () => void }) {
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  if (review.owner_reply) {
    return (
      <div className="mt-2 rounded-lg bg-slate-50 dark:bg-zinc-900/50 p-2 text-sm">
        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Your reply</p>
        <p>{review.owner_reply}</p>
      </div>
    )
  }

  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-xs text-amber-600 hover:underline">Reply</button>

  async function submit() {
    if (!reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/bario-one/spott/reviews/${review.id}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reply }) })
      if (res.ok) onReplied()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex gap-2">
      <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className={input} />
      <button onClick={submit} disabled={busy} className={btnPrimary}>Send</button>
    </div>
  )
}

export default function BarioOneSpottReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/spott/reviews')
    const data = await res.json()
    setReviews(data.reviews ?? [])
  }

  useEffect(() => { load() }, [])

  if (reviews === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (reviews.length === 0) return <p className="text-sm text-slate-500 dark:text-zinc-400">No Spott reviews yet.</p>

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
      {reviews.map((r) => (
        <div key={r.id} className="p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{r.rating != null ? `${r.rating} / 5` : 'No rating'}</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(r.created_at).toLocaleDateString()}</p>
          </div>
          {r.body && <p className="mt-1 text-sm">{r.body}</p>}
          <ReplyBox review={r} onReplied={load} />
        </div>
      ))}
    </div>
  )
}
