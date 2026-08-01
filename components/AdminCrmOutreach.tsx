'use client'

import { useEffect, useState } from 'react'

type ReadyItem = { personId: string; noteId: string; companyName: string; email: string; subject: string; body: string }
type CrmGroup = { crm: string; businessName: string; ready: ReadyItem[] }
type Stat = { crm: string; businessName: string; drafted: number; sent: number; replied: number; unanswered: number }
type ReplyItem = { id: string; person_id: string | null; from_email: string; subject: string; body: string; received_at: string }
type ReplyGroup = { crm: string; businessName: string; replies: ReplyItem[] }

function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {stats.map((s) => (
        <div key={s.crm} className="rounded-xl border border-slate-300 dark:border-zinc-700 p-4">
          <p className="font-medium mb-2">{s.businessName}</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold">{s.drafted}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Drafted</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{s.sent}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Sent</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{s.replied}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Replies</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-amber-600 dark:text-[#f59e0b]">{s.unanswered}</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Awaiting response</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function OutreachCard({ crmKey, item, onSent }: { crmKey: string; item: ReadyItem; onSent: (personId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(item.subject)
  const [body, setBody] = useState(item.body)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crmKey, personId: item.personId, subject, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      onSent(item.personId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-300 dark:border-zinc-700 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{item.companyName}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{item.email}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
            {expanded ? 'Hide' : 'Review & edit'}
          </button>
          <button onClick={handleSend} disabled={sending} className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm font-medium" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
    </div>
  )
}

function ReplyCard({ crmKey, reply, onResponded }: { crmKey: string; reply: ReplyItem; onResponded: (id: string) => void }) {
  const [mode, setMode] = useState<'manual' | 'ai' | null>(null)
  const [responseBody, setResponseBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickAi() {
    setMode('ai')
    setDrafting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/draft-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to draft')
      setResponseBody(data.draft)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  async function handleSend() {
    if (!mode) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/send-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id, body: responseBody, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      onResponded(reply.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-300 dark:border-zinc-700 p-4 space-y-3">
      <div>
        <p className="font-medium">{reply.from_email}</p>
        <p className="text-xs text-slate-500 dark:text-zinc-400">{reply.subject}</p>
        <p className="text-sm mt-2 whitespace-pre-wrap text-slate-700 dark:text-zinc-300">{reply.body}</p>
      </div>

      {!mode && (
        <div className="flex gap-2">
          <button onClick={() => { setMode('manual'); setResponseBody('') }} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
            Reply manually
          </button>
          <button onClick={pickAi} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
            AI-drafted reply
          </button>
        </div>
      )}

      {mode && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
          <p className="text-xs text-slate-500 dark:text-zinc-400">{mode === 'ai' ? 'AI draft — review before sending' : 'Write your reply'}</p>
          <textarea
            value={drafting ? 'Drafting…' : responseBody}
            onChange={(e) => setResponseBody(e.target.value)}
            disabled={drafting}
            rows={6}
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setMode(null)} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
              Cancel
            </button>
            <button onClick={handleSend} disabled={sending || drafting || !responseBody.trim()} className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5">
              {sending ? 'Sending…' : 'Send response'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default function AdminCrmOutreach() {
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [groups, setGroups] = useState<CrmGroup[] | null>(null)
  const [replyGroups, setReplyGroups] = useState<ReplyGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setError(null)
    Promise.all([
      fetch('/api/admin/crm-leadgen/stats').then((r) => r.json()),
      fetch('/api/admin/crm-leadgen/pending').then((r) => r.json()),
      fetch('/api/admin/crm-leadgen/replies').then((r) => r.json()),
    ])
      .then(([statsData, pendingData, repliesData]) => {
        if (!statsData.ok) throw new Error(statsData.error)
        if (!pendingData.ok) throw new Error(pendingData.error)
        if (!repliesData.ok) throw new Error(repliesData.error)
        setStats(statsData.results)
        setGroups(pendingData.results)
        setReplyGroups(repliesData.results)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  function markSent(crmKey: string, personId: string) {
    setGroups((prev) => (prev ? prev.map((g) => (g.crm === crmKey ? { ...g, ready: g.ready.filter((r) => r.personId !== personId) } : g)) : prev))
    setStats((prev) => (prev ? prev.map((s) => (s.crm === crmKey ? { ...s, sent: s.sent + 1 } : s)) : prev))
  }

  function markResponded(crmKey: string, replyId: string) {
    setReplyGroups((prev) => (prev ? prev.map((g) => (g.crm === crmKey ? { ...g, replies: g.replies.filter((r) => r.id !== replyId) } : g)) : prev))
    setStats((prev) => (prev ? prev.map((s) => (s.crm === crmKey ? { ...s, unanswered: Math.max(0, s.unanswered - 1) } : s)) : prev))
  }

  if (error) return <p className="text-sm text-red-500 dark:text-red-400 p-6">{error}</p>
  if (!stats || !groups || !replyGroups) return <p className="text-sm text-slate-500 dark:text-zinc-400 p-6">Loading…</p>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold">CRM Outreach</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          Nothing here sends automatically — every outbound email and every reply response needs your explicit click.
        </p>
      </div>

      <StatsRow stats={stats} />

      {replyGroups.some((g) => g.replies.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Replies awaiting a response</h2>
          {replyGroups.map(
            (g) =>
              g.replies.length > 0 && (
                <div key={g.crm} className="space-y-3">
                  <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">{g.businessName}</p>
                  {g.replies.map((r) => (
                    <ReplyCard key={r.id} crmKey={g.crm} reply={r} onResponded={(id) => markResponded(g.crm, id)} />
                  ))}
                </div>
              )
          )}
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Outreach ready to send</h2>
        {groups.map((group) => (
          <div key={group.crm} className="space-y-3">
            <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
              {group.businessName} ({group.ready.length})
            </p>
            {group.ready.length === 0 && <p className="text-sm text-slate-400">Nothing ready right now.</p>}
            {group.ready.map((item) => (
              <OutreachCard key={item.personId} crmKey={group.crm} item={item} onSent={(personId) => markSent(group.crm, personId)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
