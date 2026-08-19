'use client'

import { useState } from 'react'

export default function CareersApplicationForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roleInterest, setRoleInterest] = useState('')
  const [resumeLink, setResumeLink] = useState('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/careers-application', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone, roleInterest, resumeLink, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not submit — try again')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm'

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
        Thanks — your application has been received. Check your email for a confirmation, and we'll be in touch if there's a fit.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Role you're interested in</label>
          <input value={roleInterest} onChange={(e) => setRoleInterest(e.target.value)} placeholder="e.g. Frontend Engineer" className={inputClass} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Resume / portfolio / LinkedIn link (optional)</label>
        <input value={resumeLink} onChange={(e) => setResumeLink(e.target.value)} placeholder="https://…" className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Tell us about yourself and what you'd want to work on</label>
        <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
    </form>
  )
}
