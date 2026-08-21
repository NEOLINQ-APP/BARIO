'use client'

import { useEffect, useState } from 'react'
import BarioOneCustomFieldInputs from './BarioOneCustomFieldInputs'

type FieldDef = { id: string; name: string; field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; options: string[] }

type Priority = 'red' | 'yellow' | 'green' | 'grey'

const PRIORITY_BADGE: Record<Priority, { emoji: string; label: string; classes: string }> = {
  red: { emoji: '🔴', label: 'Hot', classes: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-400/40' },
  yellow: { emoji: '🟡', label: 'Warm', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-400/40' },
  green: { emoji: '🟢', label: 'Nurture', classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-400/40' },
  grey: { emoji: '⚫', label: 'Inactive', classes: 'bg-slate-500/10 text-slate-500 dark:text-zinc-500 border-slate-400/30' },
}

type Data = {
  customer: { id: string; company_name: string | null; contact_name: string; phone: string | null; email: string | null; address: string | null; tags: string[]; customFields: Record<string, unknown>; assigned_to_user_id: string | null; current_score: number | null; current_priority: Priority | null; do_not_contact: boolean; do_not_contact_reason: string | null }
  deals: { id: string; title: string; stage: string; value_cents: number }[]
  tasks: { id: string; title: string; status: string; due_at: string | null }[]
  notes: { id: string; kind: 'note' | 'email' | 'sms' | 'comment'; body: string; created_at: string; author_email: string | null; direction: 'outbound' | 'inbound' | null; from_email: string | null }[]
  customFieldDefs: FieldDef[]
  priorityReason: string | null
  leadSignals: Record<string, unknown>
} | null

type LeadSignals = {
  strongNeed?: boolean
  problemIdentified?: boolean
  goalIdentified?: boolean
  businessIcpMatch?: boolean
  customerTypeMatch?: boolean
  locationMatch?: boolean
  serviceMatch?: boolean
  hasProviderCapacity?: boolean
  isEmergency?: boolean
  timing?: 'today' | 'this_week' | 'this_month' | 'one_to_three_months' | 'future' | ''
  disqualified?: boolean
  disqualifiedReason?: string
}

const SIGNAL_CHECKBOXES: { key: keyof LeadSignals; label: string }[] = [
  { key: 'strongNeed', label: 'Strong need expressed' },
  { key: 'problemIdentified', label: 'Problem identified' },
  { key: 'goalIdentified', label: 'Goal identified' },
  { key: 'businessIcpMatch', label: 'Fits ideal customer profile' },
  { key: 'customerTypeMatch', label: 'Right customer type' },
  { key: 'locationMatch', label: 'Location match' },
  { key: 'serviceMatch', label: 'Service match' },
  { key: 'hasProviderCapacity', label: 'We have capacity for this' },
  { key: 'isEmergency', label: 'Emergency / urgent' },
]

function LeadSignalsPanel({ customerId, initial, onScoreUpdated }: {
  customerId: string
  initial: Record<string, unknown>
  onScoreUpdated: (result: { score: number; priority: Priority; reason: string } | null) => void
}) {
  const [signals, setSignals] = useState<LeadSignals>(() => ({ timing: '', ...initial }))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setBusy(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/bario-one/crm/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signals: { ...signals, timing: signals.timing || null } }),
      })
      const data = await res.json()
      if (res.ok) {
        onScoreUpdated(data.score !== undefined ? { score: data.score, priority: data.priority, reason: data.reason } : null)
        setSaved(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
      <p className="text-sm font-semibold">Lead signals</p>
      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">What you know about this lead's need/fit/intent — drives the score above alongside contact-info completeness and pipeline stage.</p>
      <div className="mt-3 space-y-1.5">
        {SIGNAL_CHECKBOXES.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!signals[key]}
              onChange={(e) => setSignals((s) => ({ ...s, [key]: e.target.checked }))}
              className="rounded border-slate-300 dark:border-zinc-700"
            />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-3">
        <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Timing</label>
        <select
          value={signals.timing || ''}
          onChange={(e) => setSignals((s) => ({ ...s, timing: e.target.value as LeadSignals['timing'] }))}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
        >
          <option value="">Unknown</option>
          <option value="today">Today</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="one_to_three_months">1–3 months</option>
          <option value="future">Someday / future</option>
        </select>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!signals.disqualified}
            onChange={(e) => setSignals((s) => ({ ...s, disqualified: e.target.checked }))}
            className="rounded border-slate-300 dark:border-zinc-700"
          />
          Disqualified / inactive (marks grey regardless of score)
        </label>
        {signals.disqualified && (
          <input
            value={signals.disqualifiedReason || ''}
            onChange={(e) => setSignals((s) => ({ ...s, disqualifiedReason: e.target.value }))}
            placeholder="Why? (e.g. outside service area, spam, closed lost)"
            className="mt-2 w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm"
          />
        )}
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="mt-3 w-full px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save & recalculate'}
      </button>
    </div>
  )
}

type OrgMember = { userId: string | null; email: string | null; role: string; status: string }

// Wraps @token substrings that match a real org member's email local-part
// in a highlighted span -- purely a display concern, resolution to a real
// user id already happened server-side in parseMentions().
function renderWithMentions(body: string, members: OrgMember[]) {
  const localParts = new Set(members.filter((m) => m.email).map((m) => m.email!.split('@')[0].toLowerCase()))
  const parts = body.split(/(@[a-zA-Z0-9._-]+)/g)
  return parts.map((part, i) => {
    const isMention = part.startsWith('@') && localParts.has(part.slice(1).toLowerCase())
    return isMention ? (
      <span key={i} className="text-amber-600 dark:text-[#d4af37] font-medium">
        {part}
      </span>
    ) : (
      part
    )
  })
}

// Manual counterpart to the automatic unsubscribe link on bulk campaigns
// (lib/barioOneCampaigns.ts) — covers the case where someone opts out by
// replying "stop" or asking on a call rather than clicking the email link.
// Checked by every real send path (campaigns, automations) before a
// message goes out — see lib/barioOneSuppression.ts's isSuppressed().
function DoNotContactToggle({ customerId, doNotContact, reason, onChanged }: {
  customerId: string
  doNotContact: boolean
  reason: string | null
  onChanged: (v: boolean, reason: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [reasonInput, setReasonInput] = useState(reason || '')

  async function toggle(next: boolean) {
    setBusy(true)
    try {
      await fetch(`/api/bario-one/crm/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doNotContact: next, doNotContactReason: reasonInput }),
      })
      onChanged(next, next ? reasonInput || null : null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={doNotContact} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="rounded border-slate-300 dark:border-zinc-700" />
        Do not contact
      </label>
      {doNotContact ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Excluded from campaigns and automations{reason ? ` — ${reason}` : ''}.</p>
      ) : (
        <input
          value={reasonInput}
          onChange={(e) => setReasonInput(e.target.value)}
          placeholder="Reason (optional, e.g. asked to stop)"
          className="mt-1 w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] text-xs"
        />
      )}
    </div>
  )
}

function AssignedToPicker({ customerId, assignedToUserId, myRole, members, onChanged }: {
  customerId: string
  assignedToUserId: string | null
  myRole: string
  members: OrgMember[]
  onChanged: (userId: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const assignee = members.find((m) => m.userId === assignedToUserId)

  if (myRole === 'employee') {
    return (
      <p className="text-sm">
        <span className="text-slate-500 dark:text-zinc-400">Assigned to: </span>
        {assignee?.email ?? 'Unassigned'}
      </p>
    )
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const userId = e.target.value || null
    setBusy(true)
    try {
      const res = await fetch(`/api/bario-one/crm/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToUserId: userId }),
      })
      if (res.ok) onChanged(userId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="text-sm flex items-center gap-2">
      <span className="text-slate-500 dark:text-zinc-400">Assigned to</span>
      <select
        value={assignedToUserId ?? ''}
        onChange={handleChange}
        disabled={busy}
        className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1 text-sm"
      >
        <option value="">Unassigned</option>
        {members
          .filter((m) => m.userId && m.status === 'active')
          .map((m) => (
            <option key={m.userId} value={m.userId!}>
              {m.email}
            </option>
          ))}
      </select>
    </label>
  )
}

const KIND_LABEL: Record<string, string> = { note: '📝 Note', email: '📧 Email', sms: '💬 SMS', comment: '💬 Comment' }

function SendBox({ customerId, hasEmail, hasPhone, members, onSent }: { customerId: string; hasEmail: boolean; hasPhone: boolean; members: OrgMember[]; onSent: () => void }) {
  const [mode, setMode] = useState<'note' | 'email' | 'sms' | 'comment'>('note')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Trailing "@partial" at the end of the body, if any -- drives the
  // lightweight mention-suggestion list below the textarea.
  const mentionQuery = mode === 'comment' ? body.match(/@([a-zA-Z0-9._-]*)$/)?.[1] : undefined
  const mentionSuggestions =
    mentionQuery !== undefined
      ? members.filter((m) => m.email && m.status === 'active' && m.email.split('@')[0].toLowerCase().startsWith(mentionQuery.toLowerCase()))
      : []

  function insertMention(email: string) {
    const localPart = email.split('@')[0]
    setBody((prev) => prev.replace(/@([a-zA-Z0-9._-]*)$/, `@${localPart} `))
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const isComment = mode === 'comment'
      const path =
        mode === 'email'
          ? `/api/bario-one/crm/customers/${customerId}/email`
          : mode === 'sms'
          ? `/api/bario-one/crm/customers/${customerId}/sms`
          : `/api/bario-one/crm/customers/${customerId}/notes`
      const payload = mode === 'email' ? { subject, body } : isComment ? { body, kind: 'comment' } : { body }
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setSubject('')
      setBody('')
      onSent()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSend} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3">
      <div className="flex gap-2">
        {(['note', 'comment', 'email', 'sms'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={(m === 'email' && !hasEmail) || (m === 'sms' && !hasPhone)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 ${mode === m ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800'}`}
          >
            {KIND_LABEL[m]}
          </button>
        ))}
      </div>
      {mode === 'email' && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      )}
      <div className="relative">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          placeholder={mode === 'note' ? 'Internal note…' : mode === 'email' ? 'Email message…' : mode === 'sms' ? 'Text message…' : 'Comment… type @ to mention a teammate'}
          className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm"
        />
        {mentionSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#131b2a] shadow-lg overflow-hidden">
            {mentionSuggestions.slice(0, 5).map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => insertMention(m.email!)}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                @{m.email!.split('@')[0]}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
        {busy ? 'Sending…' : mode === 'note' ? 'Add note' : mode === 'comment' ? 'Post comment' : `Send ${mode}`}
      </button>
    </form>
  )
}

export default function BarioOneCrmDetail({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Data>(undefined as any)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [myRole, setMyRole] = useState<string>('employee')

  async function load() {
    const res = await fetch(`/api/bario-one/crm/customers/${customerId}`)
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [customerId])

  useEffect(() => {
    fetch('/api/bario-one/organization')
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members ?? [])
        setMyRole(d.myRole ?? 'employee')
      })
      .catch(() => {})
  }, [])

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Customer not found.</p>

  const { customer, deals, tasks, notes, customFieldDefs, priorityReason } = data

  async function saveCustomField(fieldId: string, value: unknown) {
    setData((prev) => (prev ? { ...prev, customer: { ...prev.customer, customFields: { ...prev.customer.customFields, [fieldId]: value } } } : prev))
    await fetch(`/api/bario-one/crm/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customFields: { [fieldId]: value } }),
    })
  }

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <SendBox customerId={customerId} hasEmail={Boolean(customer.email)} hasPhone={Boolean(customer.phone)} members={members} onSent={load} />

        <div>
          <p className="text-sm font-semibold mb-2">History</p>
          <div className="space-y-2">
            {notes.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
            {notes.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-3 text-sm ${
                  n.direction === 'inbound'
                    ? 'border-amber-300 dark:border-[#d4af37]/40 bg-amber-50/50 dark:bg-[#d4af37]/5 mr-6'
                    : 'border-slate-200 dark:border-zinc-800 ml-6'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 mb-1">
                  <span>
                    {n.direction === 'inbound' ? '↩ Reply' : KIND_LABEL[n.kind]}
                    {n.direction === 'inbound' && n.from_email ? ` — ${n.from_email}` : n.author_email ? ` — ${n.author_email}` : ''}
                  </span>
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap">{n.kind === 'comment' ? renderWithMentions(n.body, members) : n.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <h2 className="font-bold text-lg">{customer.contact_name}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">{customer.company_name}</p>
          {customer.current_priority && customer.current_score !== null && (
            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${PRIORITY_BADGE[customer.current_priority].classes}`}>
              <p className="font-semibold">
                {PRIORITY_BADGE[customer.current_priority].emoji} {PRIORITY_BADGE[customer.current_priority].label} — {customer.current_score}/100
              </p>
              {priorityReason && <p className="mt-0.5 opacity-90">{priorityReason}</p>}
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <p>📧 {customer.email || '—'}</p>
            <p>📞 {customer.phone || '—'}</p>
            <p>📍 {customer.address || '—'}</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <DoNotContactToggle
              customerId={customerId}
              doNotContact={customer.do_not_contact}
              reason={customer.do_not_contact_reason}
              onChanged={(v, reason) => setData((prev) => (prev ? { ...prev, customer: { ...prev.customer, do_not_contact: v, do_not_contact_reason: reason } } : prev))}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
            <AssignedToPicker
              customerId={customerId}
              assignedToUserId={customer.assigned_to_user_id}
              myRole={myRole}
              members={members}
              onChanged={(userId) => setData((prev) => (prev ? { ...prev, customer: { ...prev.customer, assigned_to_user_id: userId } } : prev))}
            />
          </div>
        </div>

        <LeadSignalsPanel
          customerId={customerId}
          initial={data.leadSignals}
          onScoreUpdated={(result) =>
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    customer: { ...prev.customer, current_score: result?.score ?? prev.customer.current_score, current_priority: result?.priority ?? prev.customer.current_priority },
                    priorityReason: result?.reason ?? prev.priorityReason,
                  }
                : prev
            )
          }
        />

        {customFieldDefs.length > 0 && (
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
            <p className="text-sm font-semibold mb-2">Custom fields</p>
            <BarioOneCustomFieldInputs fields={customFieldDefs} values={customer.customFields} onChange={saveCustomField} />
          </div>
        )}

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Deals</p>
          {deals.length === 0 && <p className="text-xs text-slate-400">No deals yet.</p>}
          <ul className="space-y-1">
            {deals.map((d) => (
              <li key={d.id} className="text-sm flex justify-between">
                <span>{d.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 capitalize">{d.stage}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
          <p className="text-sm font-semibold mb-2">Tasks</p>
          {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="text-sm flex justify-between">
                <span className={t.status === 'done' ? 'line-through text-slate-400' : ''}>{t.title}</span>
                {t.due_at && <span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
