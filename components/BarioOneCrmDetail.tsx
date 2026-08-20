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
  customer: { id: string; company_name: string | null; contact_name: string; phone: string | null; email: string | null; address: string | null; tags: string[]; customFields: Record<string, unknown>; assigned_to_user_id: string | null; current_score: number | null; current_priority: Priority | null }
  deals: { id: string; title: string; stage: string; value_cents: number }[]
  tasks: { id: string; title: string; status: string; due_at: string | null }[]
  notes: { id: string; kind: 'note' | 'email' | 'sms' | 'comment'; body: string; created_at: string; author_email: string | null; direction: 'outbound' | 'inbound' | null; from_email: string | null }[]
  customFieldDefs: FieldDef[]
  priorityReason: string | null
} | null

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
            <AssignedToPicker
              customerId={customerId}
              assignedToUserId={customer.assigned_to_user_id}
              myRole={myRole}
              members={members}
              onChanged={(userId) => setData((prev) => (prev ? { ...prev, customer: { ...prev.customer, assigned_to_user_id: userId } } : prev))}
            />
          </div>
        </div>

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
