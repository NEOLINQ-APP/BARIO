'use client'

import { useEffect, useState } from 'react'
import BarioOneCustomFieldInputs from './BarioOneCustomFieldInputs'

type Deal = { id: string; title: string; stage: string; value_cents: number; contact_name: string; company_name: string | null; customFields: Record<string, unknown> }
type CustomerOption = { id: string; contact_name: string; company_name: string | null }
type FieldDef = { id: string; name: string; field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; options: string[] }

const STAGES = ['lead', 'opportunity', 'quote', 'won', 'lost'] as const
const STAGE_LABEL: Record<string, string> = { lead: 'Leads', opportunity: 'Opportunities', quote: 'Quotes', won: 'Won', lost: 'Lost' }

function AddDealForm({ customers, dealFields, onAdded }: { customers: CustomerOption[]; dealFields: FieldDef[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [title, setTitle] = useState('')
  const [valueDollars, setValueDollars] = useState('')
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/crm/deals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId, title, valueCents: Math.round(Number(valueDollars || 0) * 100), customFields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setTitle('')
      setValueDollars('')
      setCustomFields({})
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
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 mb-4">
        + Add deal
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
        <option value="">Select customer…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>
        ))}
      </select>
      <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      <input value={valueDollars} onChange={(e) => setValueDollars(e.target.value)} placeholder="Value ($)" type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
      {dealFields.length > 0 && (
        <BarioOneCustomFieldInputs fields={dealFields} values={customFields} onChange={(id, value) => setCustomFields((prev) => ({ ...prev, [id]: value }))} />
      )}
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Saving…' : 'Save deal'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOneCrmPipeline() {
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [dealFields, setDealFields] = useState<FieldDef[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/crm/deals')
    const data = await res.json()
    setDeals(data.deals ?? [])
  }

  async function loadCustomers() {
    const res = await fetch('/api/bario-one/crm/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
  }

  async function loadDealFields() {
    const res = await fetch('/api/bario-one/crm/custom-fields?entityType=deal')
    const data = await res.json()
    setDealFields(data.fields ?? [])
  }

  useEffect(() => {
    load()
    loadCustomers()
    loadDealFields()
  }, [])

  async function moveStage(id: string, stage: string) {
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, stage } : d)) ?? null)
    await fetch(`/api/bario-one/crm/deals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  async function saveDealCustomField(id: string, fieldId: string, value: unknown) {
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, customFields: { ...d.customFields, [fieldId]: value } } : d)) ?? null)
    await fetch(`/api/bario-one/crm/deals/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customFields: { [fieldId]: value } }),
    })
  }

  if (deals === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <AddDealForm customers={customers} dealFields={dealFields} onAdded={load} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {STAGES.map((stage) => (
        <div key={stage} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            {STAGE_LABEL[stage]} ({deals.filter((d) => d.stage === stage).length})
          </p>
          <div className="space-y-2 min-h-[80px]">
            {deals
              .filter((d) => d.stage === stage)
              .map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-3 space-y-2">
                  <p className="text-sm font-semibold">{d.title}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{d.contact_name}{d.company_name ? ` — ${d.company_name}` : ''}</p>
                  {d.value_cents > 0 && <p className="text-xs font-medium">${(d.value_cents / 100).toLocaleString()}</p>}
                  <select
                    value={d.stage}
                    onChange={(e) => moveStage(d.id, e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                    ))}
                  </select>
                  {dealFields.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === d.id ? null : d.id))}
                        className="text-xs text-amber-600 dark:text-[#d4af37] hover:underline"
                      >
                        {expandedId === d.id ? 'Hide fields' : 'Custom fields'}
                      </button>
                      {expandedId === d.id && (
                        <BarioOneCustomFieldInputs
                          fields={dealFields}
                          values={d.customFields}
                          onChange={(fieldId, value) => saveDealCustomField(d.id, fieldId, value)}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}
