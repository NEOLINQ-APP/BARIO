'use client'

import { useEffect, useState } from 'react'

type Customer = {
  id: string
  company_name: string | null
  contact_name: string
  phone: string | null
  email: string | null
  tags: string[]
}

function AddCustomerForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyName, contactName, phone, email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setCompanyName('')
      setContactName('')
      setPhone('')
      setEmail('')
      setOpen(false)
      onAdded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
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

export default function BarioOneCrmList() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [q, setQ] = useState('')

  async function load(query?: string) {
    const res = await fetch(`/api/bario-one/crm/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
    const data = await res.json()
    setCustomers(data.customers ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
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
        </div>
      </div>

      <AddCustomerForm onAdded={() => load(q)} />

      {customers === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No customers yet — add your first one above.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {customers.map((c) => (
            <a key={c.id} href={`/dashboard/bario-one/crm/${c.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900">
              <div>
                <p className="font-semibold text-sm">{c.contact_name}</p>
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
