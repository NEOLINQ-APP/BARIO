'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Customer = {
  id: string
  company_name: string | null
  contact_name: string
  phone: string | null
  email: string | null
  tags: string[]
  current_score: number | null
  current_priority: 'red' | 'yellow' | 'green' | 'grey' | null
}

const PRIORITY_BADGE: Record<'red' | 'yellow' | 'green' | 'grey', { emoji: string; label: string; classes: string }> = {
  red: { emoji: '🔴', label: 'Hot', classes: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  yellow: { emoji: '🟡', label: 'Warm', classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  green: { emoji: '🟢', label: 'Nurture', classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  grey: { emoji: '⚫', label: 'Inactive', classes: 'bg-slate-500/10 text-slate-500 dark:text-zinc-500' },
}

function PriorityBadge({ score, priority }: { score: number | null; priority: Customer['current_priority'] }) {
  if (!priority || score === null) return null
  const badge = PRIORITY_BADGE[priority]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
      {badge.emoji} {badge.label} {score}/100
    </span>
  )
}

type DuplicateMatch = { id: string; contactName: string; companyName: string | null; matchedOn: 'email' | 'phone' | 'company_and_address' }

const MATCH_LABEL: Record<DuplicateMatch['matchedOn'], string> = {
  email: 'email address',
  phone: 'phone number',
  company_and_address: 'company name and address',
}

function AddCustomerForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null)

  async function submit(confirmDuplicate: boolean) {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyName, contactName, phone, email, confirmDuplicate }),
      })
      const data = await res.json()
      if (res.status === 409 && data.duplicate) {
        setDuplicate(data.duplicate)
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setCompanyName('')
      setContactName('')
      setPhone('')
      setEmail('')
      setDuplicate(null)
      setOpen(false)
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2"
      >
        + Add customer
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name (optional)" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {duplicate && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-sm space-y-2">
          <p>
            <strong>Possible duplicate</strong> — a customer named <strong>{duplicate.contactName}</strong>
            {duplicate.companyName ? ` (${duplicate.companyName})` : ''} already exists, matched by {MATCH_LABEL[duplicate.matchedOn]}.
          </p>
          <div className="flex gap-2">
            <a href={`/dashboard/bario-one/crm/${duplicate.id}`} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800">
              Open existing
            </a>
            <button type="button" disabled={busy} onClick={() => submit(true)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white">
              Create anyway
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save customer'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

type ImportResult = { imported: number; updated: number; skipped: number; errors: { row: number; reason: string }[] }

function ImportExportButtons({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file name after a failed attempt
    if (!file) return
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const csv = await file.text()
      const res = await fetch('/api/bario-one/crm/customers/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResult(data)
      onImported()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <a
          href="/api/bario-one/export/customers"
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800"
        >
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import CSV'}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {result && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          {result.imported} imported, {result.updated} updated
          {result.skipped > 0 && `, ${result.skipped} skipped`}
          {result.errors.length > 0 && (
            <>
              {' — '}
              {result.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.reason}`).join('; ')}
              {result.errors.length > 3 && ` (+${result.errors.length - 3} more)`}
            </>
          )}
        </p>
      )}
    </div>
  )
}

export default function BarioOneCrmList() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [q, setQ] = useState('')
  // Business OS Steps 3-15 — Contacts/Leads/Customers in the new nav all
  // link to this same page with a ?stage= param rather than duplicating
  // it into 3 separate pages (there's no separate Contact/Lead/Customer
  // table — see lib/customerLifecycle.ts). Additive: no param behaves
  // exactly as before.
  const searchParams = useSearchParams()
  const stage = searchParams.get('stage')

  async function load(query?: string) {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (stage) params.set('stage', stage)
    const qs = params.toString()
    const res = await fetch(`/api/bario-one/crm/customers${qs ? `?${qs}` : ''}`)
    const data = await res.json()
    setCustomers(data.customers ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  return (
    <div className="space-y-4">
      {stage && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-[#d4af37] font-medium capitalize">
            {stage} view
          </span>
          <a href="/dashboard/bario-one/crm" className="text-slate-500 dark:text-zinc-400 hover:underline">
            Clear filter
          </a>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(q)}
          placeholder="Search customers…"
          className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm w-64"
        />
        <div className="flex gap-2">
          <a href="/dashboard/bario-one/crm/pipeline" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Sales pipeline →
          </a>
          <a href="/dashboard/bario-one/crm/tasks" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Tasks →
          </a>
          <a href="/dashboard/bario-one/crm/invoices" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Invoices →
          </a>
          <a href="/dashboard/bario-one/crm/fields" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Custom fields →
          </a>
          <a href="/dashboard/bario-one/crm/automations" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Automations →
          </a>
          <a href="/dashboard/bario-one/crm/reports" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline self-center">
            Reports →
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AddCustomerForm onAdded={() => load(q)} />
        <ImportExportButtons onImported={() => load(q)} />
      </div>

      {customers === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No customers yet — add your first one above.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {customers.map((c) => (
            <a key={c.id} href={`/dashboard/bario-one/crm/${c.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{c.contact_name}</p>
                  <PriorityBadge score={c.current_score} priority={c.current_priority} />
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{c.company_name || '—'}</p>
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-zinc-400">
                <p>{c.email}</p>
                <p>{c.phone}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
