'use client'

import { useEffect, useMemo, useState } from 'react'

type ReadyItem = { personId: string; noteId: string; companyName: string; email: string; subject: string; body: string; scheduledAt: string | null }
type CrmGroup = { crm: string; businessName: string; ready: ReadyItem[] }
type Stat = { crm: string; businessName: string; drafted: number; sent: number; replied: number; unanswered: number }
type ReplyItem = { id: string; person_id: string | null; from_email: string; subject: string; body: string; received_at: string; sentiment: string | null }
type ReplyGroup = { crm: string; businessName: string; replies: ReplyItem[] }
type ScheduledItem = { crm: string; businessName: string; kind: 'outreach' | 'reply'; id: string; scheduledAt: string; label: string }

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'funny', label: 'Funny' },
  { value: 'casual', label: 'Casual' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'anxious', label: 'Anxious / concerned' },
]

const EMAIL_TYPE_OPTIONS = [
  { value: 'direct_pitch', label: 'Direct Commercial Pitch' },
  { value: 'unit_turnover', label: 'Unit Turnover / Maintenance' },
  { value: 'pre_budget', label: 'Pre-Budget / Planning' },
  { value: 'backup_partner', label: 'Subcontractor / Backup Partner' },
  { value: 'local_reference', label: 'Local Project Reference' },
  { value: 'gentle_bump', label: '"Gentle Bump" Follow-Up' },
  { value: 'value_add', label: 'Value-Add / Scope Checklist' },
  { value: 'rapid_response', label: 'Emergency / Rapid Response' },
  { value: 'seasonal', label: 'Seasonal Maintenance Offer' },
  { value: 'capex', label: 'CapEx / Facility Upgrade' },
  { value: 're_engagement', label: 'Break-in / Re-engagement' },
  { value: 'case_study', label: 'Case Study / Before & After' },
  { value: 'breakup', label: '"Breakup" Email' },
  { value: 'post_meeting', label: 'Post-Meeting Thank You' },
]

const SENTIMENT_BADGE: Record<string, { emoji: string; label: string; className: string }> = {
  interested: { emoji: '🟢', label: 'Interested', className: 'bg-emerald-950 text-emerald-300' },
  not_interested: { emoji: '🔴', label: 'Not interested', className: 'bg-red-950 text-red-300' },
  ooo_wrong_person: { emoji: '🟡', label: 'OOO / wrong person', className: 'bg-amber-950 text-amber-300' },
  neutral: { emoji: '⚪', label: 'Neutral', className: 'bg-zinc-800 text-zinc-300' },
}

// Simple flat-hours SLA check (not true business-hours math — good enough
// for "is this getting old", not a precise timer).
const SLA_HOURS = 4
function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

const QUICK_TEMPLATES = [
  { label: 'Approve & book intro call', text: "Thanks for getting back to me — would you be open to a quick 15-minute call this week to go over what you need? Happy to work around your schedule, just let me know a few times that work." },
  { label: 'Approve & ask for more detail', text: "Appreciate the reply — could you share a bit more detail on scope/timeline so I can put together something useful for you?" },
  { label: 'Polite decline acknowledgment', text: "Understood, thanks for letting me know — I'll close this out on my end. Feel free to reach out anytime down the road if that changes." },
]

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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

function CalendarList({ items }: { items: ScheduledItem[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">Nothing scheduled.</p>
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.kind}:${item.id}`} className="flex items-center justify-between text-sm rounded-lg border border-slate-200 dark:border-zinc-800 px-3 py-2">
          <div>
            <span className="font-medium">{item.businessName}</span>
            <span className="text-slate-400 mx-2">·</span>
            <span>{item.label}</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-zinc-400">{new Date(item.scheduledAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function ScheduleControl({ onSendNow, onSchedule, disabled }: { onSendNow: () => void; onSchedule: (when: string) => void; disabled: boolean }) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [when, setWhen] = useState('')

  if (!showSchedule) {
    return (
      <div className="flex gap-2">
        <button onClick={onSendNow} disabled={disabled} className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5">
          Send now
        </button>
        <button onClick={() => setShowSchedule(true)} disabled={disabled} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
          Send later
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-2 items-center">
      <input
        type="datetime-local"
        value={when}
        min={toLocalInputValue(new Date())}
        onChange={(e) => setWhen(e.target.value)}
        className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5"
      />
      <button
        onClick={() => when && onSchedule(new Date(when).toISOString())}
        disabled={disabled || !when}
        className="text-xs rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-3 py-1.5"
      >
        Schedule
      </button>
      <button onClick={() => setShowSchedule(false)} className="text-xs text-slate-400 hover:text-slate-600">
        Cancel
      </button>
    </div>
  )
}

function OutreachCard({ crmKey, item, onSent, onScheduled }: { crmKey: string; item: ReadyItem; onSent: (personId: string) => void; onScheduled: (personId: string, when: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(item.subject)
  const [body, setBody] = useState(item.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tone, setTone] = useState('professional')
  const [emailType, setEmailType] = useState('direct_pitch')
  const [regenerating, setRegenerating] = useState(false)

  async function regenerate() {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/redraft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crmKey, personId: item.personId, tone, emailType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to redraft')
      setBody(data.draft)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRegenerating(false)
    }
  }

  async function submit(scheduledAt?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crmKey, personId: item.personId, subject, body, scheduledAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      if (scheduledAt) onScheduled(item.personId, scheduledAt)
      else onSent(item.personId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-300 dark:border-zinc-700 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-medium">{item.companyName}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{item.email}</p>
          {item.scheduledAt && <p className="text-xs text-amber-600 dark:text-[#f59e0b] mt-1">Scheduled for {new Date(item.scheduledAt).toLocaleString()}</p>}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => setExpanded(!expanded)} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
            {expanded ? 'Hide' : 'Review & edit'}
          </button>
          <ScheduleControl onSendNow={() => submit()} onSchedule={(w) => submit(w)} disabled={busy} />
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm font-medium" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
          <div className="flex gap-2 items-center flex-wrap">
            <select value={emailType} onChange={(e) => setEmailType(e.target.value)} className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5">
              {EMAIL_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5">
              {TONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button onClick={regenerate} disabled={regenerating} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 disabled:opacity-50 px-3 py-1.5">
              {regenerating ? 'Rewriting…' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
    </div>
  )
}

function ReplyCard({ reply, onResponded, onScheduled }: { reply: ReplyItem; onResponded: (id: string) => void; onScheduled: (id: string, when: string) => void }) {
  const [mode, setMode] = useState<'manual' | 'ai' | null>(null)
  const [responseBody, setResponseBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tone, setTone] = useState('professional')

  async function draftWithTone(selectedTone: string) {
    setMode('ai')
    setDrafting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/draft-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id, tone: selectedTone }),
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

  async function submit(scheduledAt?: string) {
    if (!mode) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crm-leadgen/send-reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id, body: responseBody, mode, scheduledAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      if (scheduledAt) onScheduled(reply.id, scheduledAt)
      else onResponded(reply.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const badge = SENTIMENT_BADGE[reply.sentiment ?? 'neutral'] ?? SENTIMENT_BADGE.neutral
  const overdue = hoursSince(reply.received_at) > SLA_HOURS

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${overdue ? 'border-red-400 dark:border-red-700' : 'border-slate-300 dark:border-zinc-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{reply.from_email}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">{reply.subject}</p>
          <p className="text-sm mt-2 whitespace-pre-wrap text-slate-700 dark:text-zinc-300">{reply.body}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${badge.className}`}>
            {badge.emoji} {badge.label}
          </span>
          {overdue && (
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-950 text-red-300 whitespace-nowrap">
              ⏰ {Math.floor(hoursSince(reply.received_at))}h — overdue
            </span>
          )}
        </div>
      </div>

      {!mode && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setMode('manual'); setResponseBody('') }} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
              Reply manually
            </button>
            <button onClick={() => draftWithTone(tone)} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
              AI-drafted reply
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {QUICK_TEMPLATES.map((qt) => (
              <button
                key={qt.label}
                onClick={() => { setMode('manual'); setResponseBody(qt.text) }}
                className="text-xs rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 px-3 py-1.5"
              >
                {qt.label}
              </button>
            ))}
          </div>
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
          {mode === 'ai' && (
            <div className="flex gap-2 items-center">
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5">
                {TONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button onClick={() => draftWithTone(tone)} disabled={drafting} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 disabled:opacity-50 px-3 py-1.5">
                Redraft with this tone
              </button>
            </div>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={() => setMode(null)} className="text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-3 py-1.5">
              Cancel
            </button>
            <ScheduleControl onSendNow={() => submit()} onSchedule={(w) => submit(w)} disabled={busy || drafting || !responseBody.trim()} />
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
  const [scheduled, setScheduled] = useState<ScheduledItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [company, setCompany] = useState<string>('all')

  function load() {
    setError(null)
    Promise.all([
      fetch('/api/admin/crm-leadgen/stats').then((r) => r.json()),
      fetch('/api/admin/crm-leadgen/pending').then((r) => r.json()),
      fetch('/api/admin/crm-leadgen/replies').then((r) => r.json()),
      fetch('/api/admin/crm-leadgen/scheduled').then((r) => r.json()),
    ])
      .then(([statsData, pendingData, repliesData, scheduledData]) => {
        if (!statsData.ok) throw new Error(statsData.error)
        if (!pendingData.ok) throw new Error(pendingData.error)
        if (!repliesData.ok) throw new Error(repliesData.error)
        if (!scheduledData.ok) throw new Error(scheduledData.error)
        setStats(statsData.results)
        setGroups(pendingData.results)
        setReplyGroups(repliesData.results)
        setScheduled(scheduledData.items)
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
  function markScheduled(crmKey: string, personId: string, when: string) {
    setGroups((prev) => (prev ? prev.map((g) => (g.crm === crmKey ? { ...g, ready: g.ready.map((r) => (r.personId === personId ? { ...r, scheduledAt: when } : r)) } : g)) : prev))
    load() // refresh the calendar list too, simplest correct way to keep it in sync
  }
  function markResponded(crmKey: string, replyId: string) {
    setReplyGroups((prev) => (prev ? prev.map((g) => (g.crm === crmKey ? { ...g, replies: g.replies.filter((r) => r.id !== replyId) } : g)) : prev))
    setStats((prev) => (prev ? prev.map((s) => (s.crm === crmKey ? { ...s, unanswered: Math.max(0, s.unanswered - 1) } : s)) : prev))
  }
  function markReplyScheduled(crmKey: string, replyId: string, when: string) {
    load()
  }

  const companies = useMemo(() => (stats ? [{ crm: 'all', businessName: 'All companies' }, ...stats.map((s) => ({ crm: s.crm, businessName: s.businessName }))] : []), [stats])

  if (error) return <p className="text-sm text-red-500 dark:text-red-400 p-6">{error}</p>
  if (!stats || !groups || !replyGroups || !scheduled) return <p className="text-sm text-slate-500 dark:text-zinc-400 p-6">Loading…</p>

  const visibleStats = company === 'all' ? stats : stats.filter((s) => s.crm === company)
  const visibleGroups = company === 'all' ? groups : groups.filter((g) => g.crm === company)
  const visibleReplyGroups = company === 'all' ? replyGroups : replyGroups.filter((g) => g.crm === company)
  const visibleScheduled = company === 'all' ? scheduled : scheduled.filter((s) => s.crm === company)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">CRM Outreach</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Nothing here sends automatically — every outbound email and every reply response needs your explicit click.
          </p>
        </div>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm font-medium"
        >
          {companies.map((c) => (
            <option key={c.crm} value={c.crm}>
              {c.businessName}
            </option>
          ))}
        </select>
      </div>

      <StatsRow stats={visibleStats} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Scheduled</h2>
        <CalendarList items={visibleScheduled} />
      </div>

      {visibleReplyGroups.some((g) => g.replies.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Replies awaiting a response</h2>
          {visibleReplyGroups.map(
            (g) =>
              g.replies.length > 0 && (
                <div key={g.crm} className="space-y-3">
                  <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">{g.businessName}</p>
                  {g.replies.map((r) => (
                    <ReplyCard key={r.id} reply={r} onResponded={(id) => markResponded(g.crm, id)} onScheduled={(id, when) => markReplyScheduled(g.crm, id, when)} />
                  ))}
                </div>
              )
          )}
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Outreach ready to send</h2>
        {visibleGroups.map((group) => (
          <div key={group.crm} className="space-y-3">
            <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
              {group.businessName} ({group.ready.length})
            </p>
            {group.ready.length === 0 && <p className="text-sm text-slate-400">Nothing ready right now.</p>}
            {group.ready.map((item) => (
              <OutreachCard
                key={item.personId}
                crmKey={group.crm}
                item={item}
                onSent={(personId) => markSent(group.crm, personId)}
                onScheduled={(personId, when) => markScheduled(group.crm, personId, when)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
